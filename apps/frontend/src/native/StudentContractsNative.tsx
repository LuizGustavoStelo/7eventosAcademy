import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, PointerEvent as ReactPointerEvent } from 'react';
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

type DrawState = {
  active: boolean;
  pointerId: number | null;
  lastX: number;
  lastY: number;
};

const EMPTY_DRAW_STATE: DrawState = {
  active: false,
  pointerId: null,
  lastX: 0,
  lastY: 0,
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

  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawStateRef = useRef<DrawState>(EMPTY_DRAW_STATE);
  const [hasSignatureStroke, setHasSignatureStroke] = useState(false);

  const selectedContract = useMemo(
    () => contracts.find((item) => item.id === selectedId) ?? null,
    [contracts, selectedId],
  );
  const selectedStatus = selectedContract?.status.trim().toUpperCase() ?? '';
  const selectedIsSigned = selectedStatus === 'SIGNED';
  const selectedPinVerified = selectedStatus === 'PIN_VERIFIED' || selectedStatus === 'SIGNED';

  const resetSignatureCanvas = useCallback(() => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return;

    const width = Math.max(canvas.clientWidth || 0, 320);
    const height = Math.max(canvas.clientHeight || 0, 180);
    const ratio = Math.max(window.devicePixelRatio || 1, 1);

    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);

    const context = canvas.getContext('2d');
    if (!context) return;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.lineWidth = 2.6 * ratio;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#0f172a';

    drawStateRef.current = { ...EMPTY_DRAW_STATE };
    setHasSignatureStroke(false);
  }, []);

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

  useEffect(() => {
    const onResize = () => {
      if (!selectedIsSigned) {
        resetSignatureCanvas();
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [resetSignatureCanvas, selectedIsSigned]);

  useEffect(() => {
    setPinInput('');
    setSignerName('');
    setAcceptTerms(false);
    setFeedback('');
    setError('');

    if (!selectedIsSigned) {
      resetSignatureCanvas();
    }
  }, [selectedId, selectedIsSigned, resetSignatureCanvas]);

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
      setFeedback('Código PIN enviado para o seu e-mail de cadastro.');
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
      setFeedback('PIN validado com sucesso. Você já pode assinar.');
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : 'Falha ao validar PIN.',
      );
    } finally {
      setVerifyingPin(false);
    }
  };

  const getCanvasPoint = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (event.clientX - rect.left) * scaleX,
      y: (event.clientY - rect.top) * scaleY,
    };
  };

  const handleSignaturePointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!selectedPinVerified || selectedIsSigned) return;

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    const point = getCanvasPoint(event);
    if (!canvas || !context || !point) return;

    canvas.setPointerCapture(event.pointerId);
    drawStateRef.current = {
      active: true,
      pointerId: event.pointerId,
      lastX: point.x,
      lastY: point.y,
    };

    context.beginPath();
    context.moveTo(point.x, point.y);
    context.lineTo(point.x + 0.01, point.y + 0.01);
    context.stroke();

    setHasSignatureStroke(true);
  };

  const handleSignaturePointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (!drawStateRef.current.active) return;

    const canvas = signatureCanvasRef.current;
    const context = canvas?.getContext('2d');
    const point = getCanvasPoint(event);
    if (!context || !point) return;

    context.beginPath();
    context.moveTo(drawStateRef.current.lastX, drawStateRef.current.lastY);
    context.lineTo(point.x, point.y);
    context.stroke();

    drawStateRef.current.lastX = point.x;
    drawStateRef.current.lastY = point.y;
    setHasSignatureStroke(true);
  };

  const finishSignaturePointer = (pointerId?: number) => {
    const canvas = signatureCanvasRef.current;

    if (
      pointerId !== undefined
      && drawStateRef.current.pointerId !== null
      && pointerId !== drawStateRef.current.pointerId
    ) {
      return;
    }

    if (canvas && drawStateRef.current.pointerId !== null) {
      try {
        canvas.releasePointerCapture(drawStateRef.current.pointerId);
      } catch {
        // Ignore release errors when the pointer was not captured.
      }
    }

    drawStateRef.current = { ...EMPTY_DRAW_STATE };
  };

  const clearSignature = () => {
    if (selectedIsSigned) return;
    resetSignatureCanvas();
  };

  const createSignatureDataUrl = (): string | null => {
    if (!hasSignatureStroke) return null;
    const canvas = signatureCanvasRef.current;
    if (!canvas) return null;

    return canvas.toDataURL('image/png');
  };

  const signContract = async () => {
    if (!selectedId) return;
    if (selectedIsSigned) {
      setFeedback('Este contrato já está assinado.');
      return;
    }

    if (!selectedPinVerified) {
      setError('Valide o PIN antes de assinar o contrato.');
      return;
    }

    if (!acceptTerms) {
      setError('É necessário aceitar os termos antes de assinar.');
      return;
    }

    const signatureData = createSignatureDataUrl();
    if (!signatureData) {
      setError('Desenhe sua assinatura antes de continuar.');
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
          signatureData,
        }),
      });
      await Promise.all([loadContracts(false), loadDetails(selectedId)]);
      setFeedback('Contrato assinado com sucesso.');
      setAcceptTerms(false);
      setPinInput('');
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
          // Mantém mensagem padrão.
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

      <div className="student-page-grid cols-2 student-contracts-main-grid">
        <article className="student-page-card student-contract-list-card">
          <div className="student-contract-section-head">
            <h4>Meus contratos</h4>
            <p>Selecione um contrato para revisar e assinar.</p>
          </div>

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

        <article className="student-page-card student-contract-sign-card">
          <div className="student-contract-section-head">
            <h4>Assinatura</h4>
            <p>Fluxo simples: valide o PIN e desenhe sua assinatura.</p>
          </div>

          {!selectedContract ? (
            <p className="student-template-empty">Selecione um contrato para continuar.</p>
          ) : (
            <div className="student-contract-sign-flow">
              <div className="student-contract-summary-grid">
                <article>
                  <span>Status</span>
                  <strong>{contractStatusLabel(selectedContract.status)}</strong>
                </article>
                <article>
                  <span>Código de assinatura</span>
                  <strong>{selectedContract.signatureCode}</strong>
                </article>
                <article>
                  <span>Assinado em</span>
                  <strong>{formatDateTime(selectedContract.signedAt)}</strong>
                </article>
              </div>

              <div className="student-contract-action-row">
                <button
                  type="button"
                  onClick={() => void downloadContract()}
                  disabled={downloading}
                >
                  {downloading ? 'Baixando...' : 'Baixar contrato'}
                </button>
                {!selectedIsSigned ? (
                  <button
                    type="button"
                    onClick={() => void requestPin()}
                    disabled={sendingPin}
                  >
                    {sendingPin ? 'Enviando PIN...' : 'Solicitar PIN por e-mail'}
                  </button>
                ) : null}
              </div>

              {selectedIsSigned ? (
                <div className="student-contract-complete-note">
                  Contrato assinado. Você pode baixar o arquivo ou revisar o conteúdo abaixo.
                </div>
              ) : (
                <>
                  <section className={`student-contract-step ${selectedPinVerified ? 'is-complete' : ''}`}>
                    <header>
                      <span>Etapa 1</span>
                      <h5>Validar PIN</h5>
                    </header>
                    <p>Digite o PIN de 6 dígitos recebido por e-mail.</p>
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
                  </section>

                  <section className={`student-contract-step ${selectedPinVerified ? '' : 'is-disabled'}`}>
                    <header>
                      <span>Etapa 2</span>
                      <h5>Assinar contrato</h5>
                    </header>
                    <p>
                      Digite seu nome, desenhe sua assinatura e confirme o aceite para concluir.
                    </p>

                    <input
                      value={signerName}
                      onChange={(event) => setSignerName(event.target.value)}
                      placeholder="Nome do assinante (opcional)"
                      disabled={!selectedPinVerified || signing}
                    />

                    <div className="student-contract-signature-canvas-wrap">
                      <canvas
                        ref={signatureCanvasRef}
                        className="student-contract-signature-canvas"
                        style={{ touchAction: 'none' }}
                        onPointerDown={handleSignaturePointerDown}
                        onPointerMove={handleSignaturePointerMove}
                        onPointerUp={(event) => finishSignaturePointer(event.pointerId)}
                        onPointerLeave={(event) => finishSignaturePointer(event.pointerId)}
                        onPointerCancel={(event) => finishSignaturePointer(event.pointerId)}
                      />
                    </div>

                    <div className="student-contract-signature-helper">
                      <small>Use mouse ou toque para desenhar sua assinatura.</small>
                      <button
                        type="button"
                        onClick={clearSignature}
                        disabled={!selectedPinVerified || !hasSignatureStroke || signing}
                      >
                        Limpar assinatura
                      </button>
                    </div>

                    <label className="student-contract-accept">
                      <input
                        type="checkbox"
                        checked={acceptTerms}
                        onChange={(event) => setAcceptTerms(event.target.checked)}
                        disabled={!selectedPinVerified || signing}
                      />
                      <span>Declaro que li e aceito os termos da assinatura eletrônica.</span>
                    </label>

                    <button
                      type="button"
                      onClick={() => void signContract()}
                      disabled={signing || !selectedPinVerified}
                      className="student-contract-sign-submit"
                    >
                      {signing ? 'Assinando...' : 'Assinar contrato'}
                    </button>
                  </section>
                </>
              )}
            </div>
          )}
        </article>
      </div>

      <article className="student-page-card student-contract-preview-card">
        <div className="student-contract-section-head">
          <h4>Documento do contrato</h4>
          <p>Confira o conteúdo antes ou depois da assinatura.</p>
        </div>
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
