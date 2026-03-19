import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';

const kpis = [
  { titulo: 'Contas ativas', valor: '1.284', variacao: '+12% no mês' },
  { titulo: 'Admins ativos', valor: '452', variacao: 'Estável' },
  { titulo: 'Alunos ativos', valor: '42,5 mil', variacao: '+8% no mês' },
  { titulo: 'Adimplência', valor: '98,2%', variacao: 'Meta 99%' },
];

const SESSION_KEY = 'academy-auth-session';
const SESSION_USER_KEY = 'academy-auth-user';

export default function App() {
  const [modoCadastro, setModoCadastro] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmacaoSenha, setConfirmacaoSenha] = useState('');
  const [erro, setErro] = useState('');
  const [autenticado, setAutenticado] = useState(
    () => window.sessionStorage.getItem(SESSION_KEY) === '1',
  );
  const [usuario, setUsuario] = useState(
    () => window.sessionStorage.getItem(SESSION_USER_KEY) ?? '',
  );

  const nomeExibicao = useMemo(() => {
    if (!usuario) {
      return 'Superadmin';
    }

    const [inicio] = usuario.split('@');
    return inicio.replace(/[._-]+/g, ' ').trim();
  }, [usuario]);

  const entrar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');

    if (!email || !senha) {
      setErro('Informe e-mail e senha para acessar a plataforma.');
      return;
    }

    window.sessionStorage.setItem(SESSION_KEY, '1');
    window.sessionStorage.setItem(SESSION_USER_KEY, email);
    setUsuario(email);
    setAutenticado(true);
  };

  const cadastrar = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErro('');

    if (!nome || !email || !senha || !confirmacaoSenha) {
      setErro('Preencha todos os campos para criar sua conta.');
      return;
    }

    if (senha !== confirmacaoSenha) {
      setErro('A confirmação de senha não confere.');
      return;
    }

    setModoCadastro(false);
    setSenha('');
    setConfirmacaoSenha('');
  };

  const sair = () => {
    window.sessionStorage.removeItem(SESSION_KEY);
    window.sessionStorage.removeItem(SESSION_USER_KEY);
    setAutenticado(false);
    setSenha('');
  };

  if (!autenticado) {
    return (
      <div className="auth-shell">
        <section className="auth-panel">
          <div className="brand auth-brand">
            <div className="brand-mark">7E</div>
            <div>
              <strong>7Eventos Academy</strong>
              <span>Acesso administrativo</span>
            </div>
          </div>

          <h1>Bem-vindo à plataforma Academy</h1>
          <p>
            Ambiente para gestão de contas, turmas, matrículas, financeiro e operações de suporte.
          </p>

          <ul>
            <li>Controle de acesso por perfil (superadmin, admin e user).</li>
            <li>Operação centralizada com trilha de auditoria.</li>
            <li>Integrações financeiras seguras por conta.</li>
          </ul>
        </section>

        <section className="auth-card">
          <div className="auth-tabs">
            <button
              type="button"
              className={!modoCadastro ? 'active' : ''}
              onClick={() => {
                setErro('');
                setModoCadastro(false);
              }}
            >
              Entrar
            </button>
            <button
              type="button"
              className={modoCadastro ? 'active' : ''}
              onClick={() => {
                setErro('');
                setModoCadastro(true);
              }}
            >
              Cadastrar
            </button>
          </div>

          <h2>{modoCadastro ? 'Criar conta' : 'Entrar'}</h2>
          <p>
            {modoCadastro
              ? 'Cadastre um novo acesso administrativo.'
              : 'Use suas credenciais para acessar o painel.'}
          </p>

          <form className="auth-form" onSubmit={modoCadastro ? cadastrar : entrar}>
            {modoCadastro ? (
              <>
                <label htmlFor="nome">Nome completo</label>
                <input
                  id="nome"
                  autoComplete="name"
                  placeholder="Nome do responsável"
                  type="text"
                  value={nome}
                  onChange={(event) => setNome(event.target.value)}
                />
              </>
            ) : null}

            <label htmlFor="email">E-mail</label>
            <input
              id="email"
              autoComplete="email"
              placeholder="admin@7eventos.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />

            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              autoComplete={modoCadastro ? 'new-password' : 'current-password'}
              placeholder="********"
              type="password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
            />

            {modoCadastro ? (
              <>
                <label htmlFor="confirmacaoSenha">Confirmar senha</label>
                <input
                  id="confirmacaoSenha"
                  autoComplete="new-password"
                  placeholder="********"
                  type="password"
                  value={confirmacaoSenha}
                  onChange={(event) => setConfirmacaoSenha(event.target.value)}
                />
              </>
            ) : null}

            {erro ? <div className="auth-error">{erro}</div> : null}

            <button type="submit">
              {modoCadastro ? 'Cadastrar e continuar' : 'Entrar na plataforma'}
            </button>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">7E</div>
          <div>
            <strong>7Eventos Academy</strong>
            <span>Superadmin</span>
          </div>
        </div>

        <nav className="menu">
          <a className="active" href="#">
            Dashboard Global
          </a>
          <a href="#">Contas</a>
          <a href="#">Admins por Conta</a>
          <a href="#">Impersonação</a>
          <a href="#">Auditoria</a>
          <a href="#">Configurações</a>
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h1>Painel Executivo</h1>
            <small>{nomeExibicao}</small>
          </div>
          <button type="button" onClick={sair}>
            Sair
          </button>
        </header>

        <section className="kpi-grid">
          {kpis.map((item) => (
            <article className="card" key={item.titulo}>
              <p>{item.titulo}</p>
              <strong>{item.valor}</strong>
              <span>{item.variacao}</span>
            </article>
          ))}
        </section>

        <section className="panel">
          <h2>Próximos passos da implantação</h2>
          <ul>
            <li>Concluir autenticação, RBAC e auditoria base no backend.</li>
            <li>Publicar CI/CD com build e push no GHCR.</li>
            <li>Implementar módulo de contas e impersonação.</li>
          </ul>
        </section>
      </main>
    </div>
  );
}

