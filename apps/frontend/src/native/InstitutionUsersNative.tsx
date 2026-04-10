import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from './api';

type PermissionItem = {
  id: string;
  code: string;
  description: string | null;
};

type RoleItem = {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  membersCount: number;
  permissions: PermissionItem[];
};

type MemberItem = {
  id: string;
  status: 'active' | 'invited' | 'suspended';
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    email: string;
    role: string;
    emailConfirmedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  roles: Array<{
    id: string;
    code: string;
    name: string;
    isSystem: boolean;
    permissions: PermissionItem[];
  }>;
};

type AuditItem = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  metadata: unknown;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    email: string;
    role: string;
  } | null;
};

type SuperadminOverviewResponse = {
  overview: {
    totalInstitutions: number;
    totalMembers: number;
    activeMembers: number;
    totalRoles: number;
    customRoles: number;
  };
  institutions: Array<{
    id: string;
    name: string;
    slug: string;
    status: string;
    membersCount: number;
    rolesCount: number;
    coursesCount: number;
    createdAt: string;
    updatedAt: string;
  }>;
};

type CatalogResponse = {
  institution: {
    id: string;
    name: string;
    slug: string;
    status: string;
  };
  permissions: PermissionItem[];
};

type TabId = 'users' | 'roles' | 'audit';

type InstitutionUsersNativeProps = {
  token: string;
  mode: 'admin' | 'superadmin';
};

function toLocalDate(value: string | null | undefined): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function compactId(value: string | null | undefined): string {
  const normalized = String(value || '').trim();
  if (!normalized) return '-';
  return normalized.slice(0, 8).toUpperCase();
}

export function InstitutionUsersNative({ token, mode }: InstitutionUsersNativeProps) {
  const isSuperadmin = mode === 'superadmin';
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [tab, setTab] = useState<TabId>('users');

  const [overview, setOverview] = useState<SuperadminOverviewResponse | null>(null);
  const [institutionId, setInstitutionId] = useState('');
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [roles, setRoles] = useState<RoleItem[]>([]);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [audit, setAudit] = useState<AuditItem[]>([]);

  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [userPassword, setUserPassword] = useState('');
  const [userRoleIds, setUserRoleIds] = useState<string[]>([]);

  const [newRoleName, setNewRoleName] = useState('');
  const [newRoleCode, setNewRoleCode] = useState('');
  const [newRolePermissionIds, setNewRolePermissionIds] = useState<string[]>([]);

  const [editingMember, setEditingMember] = useState<MemberItem | null>(null);
  const [editingMemberRoleIds, setEditingMemberRoleIds] = useState<string[]>([]);

  const [editingRole, setEditingRole] = useState<RoleItem | null>(null);
  const [editingRolePermissionIds, setEditingRolePermissionIds] = useState<string[]>([]);

  const institutionQuery = useMemo(() => {
    if (!isSuperadmin || !institutionId) return '';
    return `?institutionId=${encodeURIComponent(institutionId)}`;
  }, [institutionId, isSuperadmin]);

  const canLoadInstitutionData = !isSuperadmin || Boolean(institutionId);

  const loadAll = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');

    try {
      let selectedInstitutionId = institutionId;
      if (isSuperadmin) {
        const superadminOverview = await apiRequest<SuperadminOverviewResponse>(
          token,
          '/institution-users/superadmin-overview',
        );
        setOverview(superadminOverview);
        if (!selectedInstitutionId) {
          selectedInstitutionId = superadminOverview.institutions[0]?.id || '';
          if (selectedInstitutionId) {
            setInstitutionId(selectedInstitutionId);
          }
        }
      }

      if (!selectedInstitutionId && isSuperadmin) {
        setCatalog(null);
        setRoles([]);
        setMembers([]);
        setAudit([]);
        return;
      }

      const query = isSuperadmin
        ? `?institutionId=${encodeURIComponent(selectedInstitutionId)}`
        : '';

      const [catalogData, rolesData, membersData, auditData] = await Promise.all([
        apiRequest<CatalogResponse>(token, `/institution-users/catalog${query}`),
        apiRequest<RoleItem[]>(token, `/institution-users/roles${query}`),
        apiRequest<MemberItem[]>(token, `/institution-users/members${query}`),
        apiRequest<AuditItem[]>(token, `/institution-users/audit${query}`),
      ]);

      setCatalog(catalogData);
      setRoles(Array.isArray(rolesData) ? rolesData : []);
      setMembers(Array.isArray(membersData) ? membersData : []);
      setAudit(Array.isArray(auditData) ? auditData : []);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar gestão de usuários.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll(true);
  }, [token]);

  useEffect(() => {
    if (!isSuperadmin) return;
    if (!institutionId) return;
    void loadAll(false);
  }, [institutionId]);

  useEffect(() => {
    if (userRoleIds.length > 0) return;
    if (roles.length === 0) return;

    const preferredRole =
      roles.find((role) => role.code === 'professor') ??
      roles.find((role) => role.code === 'institution_admin') ??
      roles[0];

    if (preferredRole) {
      setUserRoleIds([preferredRole.id]);
    }
  }, [roles, userRoleIds.length]);

  const toggleInSet = (
    value: string,
    current: string[],
    setCurrent: (next: string[]) => void,
  ) => {
    if (current.includes(value)) {
      setCurrent(current.filter((item) => item !== value));
      return;
    }
    setCurrent([...current, value]);
  };

  const createMember = async () => {
    if (!userName.trim() || !userEmail.trim() || !userPassword.trim()) {
      setError('Preencha nome, e-mail e senha para criar o acesso.');
      return;
    }

    if (userRoleIds.length === 0) {
      setError('Selecione ao menos um perfil para o novo usuário.');
      return;
    }

    setSaving(true);
    setError('');
    setFeedback('');

    try {
      await apiRequest(token, `/institution-users/members${institutionQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: userName.trim(),
          email: userEmail.trim().toLowerCase(),
          password: userPassword,
          roleIds: userRoleIds,
        }),
      });

      setUserName('');
      setUserEmail('');
      setUserPassword('');
      setFeedback('Acesso criado/atualizado com sucesso.');
      await loadAll(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao criar acesso.',
      );
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    if (!newRoleName.trim()) {
      setError('Informe o nome da categoria/perfil.');
      return;
    }

    if (newRolePermissionIds.length === 0) {
      setError('Selecione ao menos uma permissão para o perfil.');
      return;
    }

    setSaving(true);
    setError('');
    setFeedback('');

    try {
      await apiRequest(token, `/institution-users/roles${institutionQuery}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRoleName.trim(),
          code: newRoleCode.trim() || undefined,
          permissionIds: newRolePermissionIds,
        }),
      });

      setNewRoleName('');
      setNewRoleCode('');
      setNewRolePermissionIds([]);
      setFeedback('Perfil criado com sucesso.');
      await loadAll(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao criar perfil.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveMemberRoles = async () => {
    if (!editingMember) return;

    if (editingMemberRoleIds.length === 0) {
      setError('Selecione ao menos um perfil para o membro.');
      return;
    }

    setSaving(true);
    setError('');
    setFeedback('');

    try {
      await apiRequest(
        token,
        `/institution-users/members/${editingMember.id}/roles${institutionQuery}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roleIds: editingMemberRoleIds }),
        },
      );

      setEditingMember(null);
      setEditingMemberRoleIds([]);
      setFeedback('Perfis do usuário atualizados.');
      await loadAll(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao atualizar perfis do usuário.',
      );
    } finally {
      setSaving(false);
    }
  };

  const changeMemberStatus = async (
    member: MemberItem,
    status: 'active' | 'invited' | 'suspended',
  ) => {
    setSaving(true);
    setError('');
    setFeedback('');

    try {
      await apiRequest(
        token,
        `/institution-users/members/${member.id}/status${institutionQuery}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status }),
        },
      );

      setFeedback('Status do usuário atualizado.');
      await loadAll(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao atualizar status do usuário.',
      );
    } finally {
      setSaving(false);
    }
  };

  const saveRolePermissions = async () => {
    if (!editingRole) return;

    if (editingRolePermissionIds.length === 0) {
      setError('Selecione ao menos uma permissão para o perfil.');
      return;
    }

    setSaving(true);
    setError('');
    setFeedback('');

    try {
      await apiRequest(
        token,
        `/institution-users/roles/${editingRole.id}/permissions${institutionQuery}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ permissionIds: editingRolePermissionIds }),
        },
      );

      setEditingRole(null);
      setEditingRolePermissionIds([]);
      setFeedback('Permissões do perfil atualizadas.');
      await loadAll(false);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : 'Falha ao atualizar permissões do perfil.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="native-page native-users-admin">
      <header className="native-page-header">
        <h2>{isSuperadmin ? 'Usuários Globais' : 'Usuários da instituição'}</h2>
        <p>
          Crie acessos, defina categorias e ajuste permissões com escopo
          institucional seguro.
        </p>
      </header>

      {isSuperadmin && overview ? (
        <div className="native-kpi-grid native-kpi-grid-small">
          <article className="native-kpi-card">
            <span>Instituições</span>
            <strong>{overview.overview.totalInstitutions}</strong>
            <small>Tenants cadastrados</small>
          </article>
          <article className="native-kpi-card">
            <span>Membros ativos</span>
            <strong>{overview.overview.activeMembers}</strong>
            <small>{overview.overview.totalMembers} no total</small>
          </article>
          <article className="native-kpi-card">
            <span>Perfis personalizados</span>
            <strong>{overview.overview.customRoles}</strong>
            <small>{overview.overview.totalRoles} perfis no total</small>
          </article>
        </div>
      ) : null}

      {isSuperadmin ? (
        <article className="native-panel">
          <header className="native-panel-header">
            <h3>Instituição em foco</h3>
          </header>

          <div className="native-form-grid">
            <label>
              Escolha a instituição para gerenciar usuários
              <select
                value={institutionId}
                onChange={(event) => setInstitutionId(event.target.value)}
              >
                {(overview?.institutions ?? []).map((institution) => (
                  <option key={institution.id} value={institution.id}>
                    {institution.name} ({institution.slug})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </article>
      ) : null}

      {loading ? <p className="native-info">Carregando gestão de usuários...</p> : null}
      {error ? <p className="native-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      {!loading && canLoadInstitutionData && catalog ? (
        <>
          <article className="native-panel">
            <header className="native-panel-header">
              <h3>
                Instituição: {catalog.institution.name}
              </h3>
              <small>{catalog.institution.slug}</small>
            </header>

            <div className="native-super-actions">
              <button type="button" className={tab === 'users' ? '' : 'ghost'} onClick={() => setTab('users')}>
                Usuários
              </button>
              <button type="button" className={tab === 'roles' ? '' : 'ghost'} onClick={() => setTab('roles')}>
                Perfis e permissões
              </button>
              <button type="button" className={tab === 'audit' ? '' : 'ghost'} onClick={() => setTab('audit')}>
                Auditoria
              </button>
            </div>
          </article>

          {tab === 'users' ? (
            <>
              <article className="native-panel">
                <header className="native-panel-header">
                  <h3>Novo acesso</h3>
                  <button type="button" onClick={() => void createMember()} disabled={saving}>
                    {saving ? 'Salvando...' : 'Criar acesso'}
                  </button>
                </header>

                <div className="native-form-grid">
                  <label>
                    Nome
                    <input
                      value={userName}
                      onChange={(event) => setUserName(event.target.value)}
                      placeholder="Nome completo"
                    />
                  </label>

                  <label>
                    E-mail
                    <input
                      type="email"
                      value={userEmail}
                      onChange={(event) => setUserEmail(event.target.value)}
                      placeholder="usuario@instituicao.com"
                    />
                  </label>

                  <label>
                    Senha inicial
                    <input
                      type="password"
                      value={userPassword}
                      onChange={(event) => setUserPassword(event.target.value)}
                      placeholder="Mínimo 8 caracteres"
                    />
                  </label>
                </div>

                <div className="native-users-permissions-grid">
                  {roles.map((role) => (
                    <label key={role.id} className="native-users-check">
                      <input
                        type="checkbox"
                        checked={userRoleIds.includes(role.id)}
                        onChange={() =>
                          toggleInSet(role.id, userRoleIds, setUserRoleIds)
                        }
                      />
                      <span>{role.name}</span>
                    </label>
                  ))}
                </div>
              </article>

              <article className="native-panel native-table-wrap">
                <header className="native-panel-header">
                  <h3>Usuários da instituição</h3>
                  <small>{members.length} registro(s)</small>
                </header>

                <table className="native-table">
                  <thead>
                    <tr>
                      <th>Usuário</th>
                      <th>Perfis</th>
                      <th>Status</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.length === 0 ? (
                      <tr>
                        <td colSpan={4}>Nenhum usuário encontrado.</td>
                      </tr>
                    ) : (
                      members.map((member) => (
                        <tr key={member.id}>
                          <td>
                            <strong>{member.user.name}</strong>
                            <br />
                            <small>{member.user.email}</small>
                          </td>
                          <td>
                            {(member.roles ?? []).map((role) => role.name).join(', ') || '-'}
                          </td>
                          <td>
                            <span className={`native-status-chip ${member.status === 'active' ? 'is-success' : member.status === 'suspended' ? 'is-warning' : 'is-neutral'}`}>
                              {member.status}
                            </span>
                          </td>
                          <td>
                            <div className="native-users-actions">
                              <button
                                type="button"
                                className="ghost"
                                onClick={() => {
                                  setEditingMember(member);
                                  setEditingMemberRoleIds(member.roles.map((role) => role.id));
                                }}
                              >
                                Perfis
                              </button>
                              <select
                                value={member.status}
                                onChange={(event) => {
                                  void changeMemberStatus(
                                    member,
                                    event.target.value as 'active' | 'invited' | 'suspended',
                                  );
                                }}
                              >
                                <option value="active">Ativo</option>
                                <option value="invited">Convidado</option>
                                <option value="suspended">Suspenso</option>
                              </select>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </article>
            </>
          ) : null}

          {tab === 'roles' ? (
            <>
              <article className="native-panel">
                <header className="native-panel-header">
                  <h3>Novo perfil/categoria</h3>
                  <button type="button" onClick={() => void createRole()} disabled={saving}>
                    {saving ? 'Salvando...' : 'Criar perfil'}
                  </button>
                </header>

                <div className="native-form-grid">
                  <label>
                    Nome do perfil
                    <input
                      value={newRoleName}
                      onChange={(event) => setNewRoleName(event.target.value)}
                      placeholder="Ex.: Coordenador Pedagógico"
                    />
                  </label>
                  <label>
                    Código (opcional)
                    <input
                      value={newRoleCode}
                      onChange={(event) => setNewRoleCode(event.target.value)}
                      placeholder="ex.: coordenador_pedagogico"
                    />
                  </label>
                </div>

                <div className="native-users-permissions-grid">
                  {catalog.permissions.map((permission) => (
                    <label key={permission.id} className="native-users-check">
                      <input
                        type="checkbox"
                        checked={newRolePermissionIds.includes(permission.id)}
                        onChange={() =>
                          toggleInSet(
                            permission.id,
                            newRolePermissionIds,
                            setNewRolePermissionIds,
                          )
                        }
                      />
                      <span>{permission.code}</span>
                    </label>
                  ))}
                </div>
              </article>

              <article className="native-panel native-table-wrap">
                <header className="native-panel-header">
                  <h3>Perfis disponíveis</h3>
                  <small>{roles.length} perfil(is)</small>
                </header>

                <table className="native-table">
                  <thead>
                    <tr>
                      <th>Perfil</th>
                      <th>Permissões</th>
                      <th>Vínculos</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roles.map((role) => (
                      <tr key={role.id}>
                        <td>
                          <strong>{role.name}</strong>
                          <br />
                          <small>{role.code}</small>
                        </td>
                        <td>{role.permissions.length}</td>
                        <td>{role.membersCount}</td>
                        <td>
                          <button
                            type="button"
                            className="ghost"
                            onClick={() => {
                              setEditingRole(role);
                              setEditingRolePermissionIds(
                                role.permissions.map((permission) => permission.id),
                              );
                            }}
                          >
                            Editar permissões
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            </>
          ) : null}

          {tab === 'audit' ? (
            <article className="native-panel native-table-wrap">
              <header className="native-panel-header">
                <h3>Trilha de auditoria</h3>
                <small>{audit.length} evento(s)</small>
              </header>

              <table className="native-table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Ação</th>
                    <th>Recurso</th>
                    <th>Responsável</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.length === 0 ? (
                    <tr>
                      <td colSpan={4}>Sem eventos de auditoria para exibir.</td>
                    </tr>
                  ) : (
                    audit.map((item) => (
                      <tr key={item.id}>
                        <td>{toLocalDate(item.createdAt)}</td>
                        <td>{item.action}</td>
                        <td>
                          {item.resourceType} #{compactId(item.resourceId)}
                        </td>
                        <td>
                          {item.actor?.name || 'Sistema'}
                          <br />
                          <small>{item.actor?.email || '-'}</small>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </article>
          ) : null}
        </>
      ) : null}

      {editingMember ? (
        <div className="native-modal-backdrop" onClick={() => setEditingMember(null)}>
          <section className="native-modal native-modal-sm" onClick={(event) => event.stopPropagation()}>
            <header className="native-panel-header">
              <h3>Perfis de {editingMember.user.name}</h3>
            </header>

            <div className="native-users-permissions-grid">
              {roles.map((role) => (
                <label key={role.id} className="native-users-check">
                  <input
                    type="checkbox"
                    checked={editingMemberRoleIds.includes(role.id)}
                    onChange={() =>
                      toggleInSet(role.id, editingMemberRoleIds, setEditingMemberRoleIds)
                    }
                  />
                  <span>{role.name}</span>
                </label>
              ))}
            </div>

            <div className="native-modal-actions">
              <button type="button" className="ghost" onClick={() => setEditingMember(null)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void saveMemberRoles()} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar perfis'}
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {editingRole ? (
        <div className="native-modal-backdrop" onClick={() => setEditingRole(null)}>
          <section className="native-modal" onClick={(event) => event.stopPropagation()}>
            <header className="native-panel-header">
              <h3>Permissões de {editingRole.name}</h3>
            </header>

            <div className="native-users-permissions-grid">
              {catalog?.permissions.map((permission) => (
                <label key={permission.id} className="native-users-check">
                  <input
                    type="checkbox"
                    checked={editingRolePermissionIds.includes(permission.id)}
                    onChange={() =>
                      toggleInSet(
                        permission.id,
                        editingRolePermissionIds,
                        setEditingRolePermissionIds,
                      )
                    }
                  />
                  <span>{permission.code}</span>
                </label>
              ))}
            </div>

            <div className="native-modal-actions">
              <button type="button" className="ghost" onClick={() => setEditingRole(null)}>
                Cancelar
              </button>
              <button type="button" onClick={() => void saveRolePermissions()} disabled={saving}>
                {saving ? 'Salvando...' : 'Salvar permissões'}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}

