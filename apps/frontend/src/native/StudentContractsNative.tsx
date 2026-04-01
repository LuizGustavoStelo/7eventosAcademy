import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE_URL, apiRequest } from './api';

type StudentContractItem = {
  id: string;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  signatureCode: string;
  template: {
    id: string;
    name: string;
  };
  templateVersion: {
    id: string;
    versionNumber: number;
    title: string;
  };
};

type StudentContractDetails = {
  id: string;
  status: string;
  sentAt: string | null;
  viewedAt: string | null;
  signedAt: string | null;
  signatureCode: string;
  acceptedAt: string | null;
  acceptedTermsVersion: string | null;
  template: {
    id: string;
    name: string;
  };
  templateVersion: {
    id: string;
    versionNumber: number;
    title: string;
  };
  documentHtml: string;
};

type StudentContractsNativeProps = {
  token: string;
  initialContractId?: string | null;
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function contractStatusLabel(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'SENT') return 'Enviado';
  if (normalized === 'VIEWED') return 'Visualizado';
  if (normalized === 'PIN_VERIFIED') return 'PIN validado';
  if (normalized === 'SIGNED') return 'Assinado';
  if (normalized === 'EXPIRED') return 'Expirado';
  if (normalized === 'ARCHIVED') return 'Arquivado';
  if (normalized === 'CANCELED') return 'Cancelado';
  return status;
}

function contractStatusTone(status: string): string {
  const normalized = status.trim().toUpperCase();
  if (normalized === 'SIGNED') return 'is-success';
  if (normalized === 'PIN_VERIFIED' || normalized === 'VIEWED') return 'is-info';
  if (normalized === 'EXPIRED' || normalized === 'CANCELED') return 'is-danger';
  if (normalized === 'ARCHIVED') return 'is-muted';
  return 'is-warning';
}

export function StudentContractsNative({
  token,
  initialContractId,
}: StudentContractsNativeProps) {
  const [contracts, setContracts] = useState<StudentContractItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<StudentContractDetails | null>(null);

  const [pinInput, setPinInput] = useState('');
  const [signerName, setSignerName] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);

  const [loading, setLoading] = useState(true);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [sendingPin, setSendingPin] = useState(false);
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [signing, setSigning] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const selectedContract = useMemo(
    () => contracts.find((item) => item.id === selectedId) ?? null,
    [contracts, selectedId],
  );
  const selectedStatus = selectedContract?.status.trim().toUpperCase() ?? '';
  const selectedIsSigned = selectedStatus === 'SIGNED';

  const loadContracts = async (showLoading = true) => {
    if (showLoading) setLoading(true);
    setError('');
    try {
      const data = await apiRequest<StudentContractItem[]>(token, '/contracts/my', undefined, {
        bypassCache: true,
      });
      const safe = Array.isArray(data) ? data : [];
      setContracts(safe);

      if (!selectedId && safe[0]?.id) {
        setSelectedId(safe[0].id);
      }
      if (selectedId && !safe.some((item) => item.id === selectedId)) {
        setSelectedId(safe[0]?.id ?? null);
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Falha ao carregar contratos.',
      );
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  const loadDetails = async (instanceId: string) => {
    setLoadingDetails(true);
    setError('');
    try {
      const details = await apiRequest<StudentContractDetails>(
        token,
        `/contracts/my/${instanceId}`,
        undefined,
        { bypassCache: true },
      );
      setSelectedDetails(details);
    } catch (detailError) {
      setError(
        detailError instanceof Error
          ? detailError.message
          : 'Falha ao carregar detalhes do contrato.',
      );
      setSelectedDetails(null);
    } finally {
      setLoadingDetails(false);
    }
  };

  useEffect(() => {
    void loadContracts(true);
  }, [token]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetails(null);
      return;
    }
    void loadDetails(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!initialContractId) return;
    if (!contracts.some((item) => item.id === initialContractId)) return;
    setSelectedId(initialContractId);
  }, [initialContractId, contracts]);

  const requestPin = async () => {
    if (!selectedId) return;

    setSendingPin(true);
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/contracts/my/${selectedId}/request-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: 'email' }),
      });
      setFeedback('PIN enviado para o seu e-mail de cadastro.');
    } catch (pinError) {
      setError(pinError instanceof Error ? pinError.message : 'Falha ao enviar PIN.');
    } finally {
      setSendingPin(false);
    }
  };

  const verifyPin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedId) return;
    if (pinInput.trim().length !== 6) {
      setError('Informe um PIN com 6 dígitos.');
      return;
    }

    setVerifyingPin(true);
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/contracts/my/${selectedId}/verify-pin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinInput.trim() }),
      });
      await Promise.all([loadContracts(false), loadDetails(selectedId)]);
      setFeedback('PIN validado com sucesso. Agora você já pode assinar.');
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : 'Falha ao validar PIN.',
      );
    } finally {
      setVerifyingPin(false);
    }
  };

  const signContract = async () => {
    if (!selectedId) return;
    if (selectedIsSigned) {
      setFeedback('Este contrato já está assinado.');
      return;
    }
    if (!acceptTerms) {
      setError('É necessário aceitar os termos antes de assinar.');
      return;
    }

    setSigning(true);
    setError('');
    setFeedback('');
    try {
      await apiRequest(token, `/contracts/my/${selectedId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acceptTerms: true,
          signerName: signerName.trim() || undefined,
          signerTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone || undefined,
        }),
      });
      await Promise.all([loadContracts(false), loadDetails(selectedId)]);
      setFeedback('Contrato assinado com sucesso.');
    } catch (signError) {
      setError(
        signError instanceof Error ? signError.message : 'Falha ao assinar contrato.',
      );
    } finally {
      setSigning(false);
    }
  };

  const downloadContract = async () => {
    if (!selectedId) return;
    setDownloading(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(
        `${API_BASE_URL}/contracts/my/${selectedId}/download`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      );

      if (!response.ok) {
        let message = `Falha ao baixar contrato (${response.status}).`;
        try {
          const payload = (await response.json()) as { message?: string | string[] };
          if (Array.isArray(payload.message)) {
            message = payload.message.join('\n');
          } else if (typeof payload.message === 'string') {
            message = payload.message;
          }
        } catch {
          // mantém mensagem padrão
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const filenameHeader = response.headers.get('content-disposition') || '';
      const filenameMatch = filenameHeader.match(/filename=\"?([^\";]+)\"?/i);
      const filename = filenameMatch?.[1] || `contrato-${selectedId}.html`;

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      setError(
        downloadError instanceof Error
          ? downloadError.message
          : 'Falha ao baixar contrato.',
      );
    } finally {
      setDownloading(false);
    }
  };

  return (
    <section className="student-page-layout student-contracts-layout">
      {loading ? <p className="student-template-loading">Carregando contratos...</p> : null}
      {error ? <p className="student-template-error">{error}</p> : null}
      {feedback ? <p className="native-success">{feedback}</p> : null}

      <div className="student-page-grid cols-2">
        <article className="student-page-card">
          <h4>Meus contratos</h4>
          {contracts.length === 0 ? (
            <p className="student-template-empty">Nenhum contrato disponível no momento.</p>
          ) : (
            <div className="student-page-list">
              {contracts.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`student-contract-item ${selectedId === item.id ? 'is-active' : ''}`}
                  onClick={() => setSelectedId(item.id)}
                >
                  <div>
                    <strong>{item.templateVersion.title}</strong>
                    <small>
                      {item.template.name} • Enviado em {formatDateTime(item.sentAt)}
                    </small>
                  </div>
                  <span className={`native-status-chip ${contractStatusTone(item.status)}`}>
                    {contractStatusLabel(item.status)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </article>

        <article className="student-page-card">
          <h4>Assinatura</h4>
          {!selectedContract ? (
            <p className="student-template-empty">Selecione um contrato para continuar.</p>
          ) : (
            <div className="student-contract-actions">
              <p>
                Status atual:{' '}
                <strong>{contractStatusLabel(selectedContract.status)}</strong>
              </p>
              <p>
                Assinado em:{' '}
                <strong>{formatDateTime(selectedContract.signedAt)}</strong>
              </p>
              <p>
                Código de assinatura:{' '}
                <strong>{selectedContract.signatureCode}</strong>
              </p>

              <button
                type="button"
                onClick={() => void downloadContract()}
                disabled={downloading}
              >
                {downloading ? 'Baixando...' : 'Baixar contrato'}
              </button>

              <button
                type="button"
                onClick={() => void requestPin()}
                disabled={sendingPin || selectedIsSigned}
              >
                {selectedIsSigned
                  ? 'Contrato já assinado'
                  : sendingPin
                    ? 'Enviando PIN...'
                    : 'Solicitar PIN por e-mail'}
              </button>

              <form onSubmit={verifyPin} className="student-contract-pin-form">
                <input
                  value={pinInput}
                  onChange={(event) => setPinInput(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Digite o PIN de 6 dígitos"
                  inputMode="numeric"
                />
                <button type="submit" disabled={verifyingPin}>
                  {verifyingPin ? 'Validando...' : 'Validar PIN'}
                </button>
              </form>

              <input
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                placeholder="Nome do assinante (opcional)"
              />

              <label className="student-contract-accept">
                <input
                  type="checkbox"
                  checked={acceptTerms}
                  onChange={(event) => setAcceptTerms(event.target.checked)}
                />
                <span>Declaro que li e aceito os termos da assinatura eletrônica.</span>
              </label>

              <button type="button" onClick={() => void signContract()} disabled={signing || selectedIsSigned}>
                {selectedIsSigned ? 'Contrato já assinado' : signing ? 'Assinando...' : 'Assinar contrato'}
              </button>
            </div>
          )}
        </article>
      </div>

      <article className="student-page-card">
        <h4>Pré-visualização do documento</h4>
        {loadingDetails || !selectedDetails ? (
          <p className="student-template-empty">
            {selectedId ? 'Carregando documento...' : 'Selecione um contrato para visualizar o conteúdo.'}
          </p>
        ) : (
          <iframe
            title="Pré-visualização do contrato do aluno"
            className="student-contract-document-frame"
            sandbox=""
            srcDoc={selectedDetails.documentHtml}
          />
        )}
      </article>
    </section>
  );
}
