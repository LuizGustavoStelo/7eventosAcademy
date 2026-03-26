import { useState } from 'react';
import type { FormEvent } from 'react';
import { API_BASE_URL } from './api';

type StudentRegistrationNativeProps = {
  embedded: boolean;
};

type RegistrationPayload = {
  name: string;
  email: string;
  password: string;
  documentCpf: string;
  phone: string;
  birthDate: string;
  gender?: string;
  guardianName?: string;
  guardianPhone?: string;
  zipCode?: string;
  street?: string;
  streetNumber?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  notes?: string;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });

async function readError(response: Response) {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) return payload.message.join(' ');
    if (typeof payload.message === 'string') return payload.message;
  } catch {
    // ignore
  }
  return 'Não foi possível concluir o cadastro.';
}

export function StudentRegistrationNative({ embedded }: StudentRegistrationNativeProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [documentCpf, setDocumentCpf] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [gender, setGender] = useState('');
  const [guardianName, setGuardianName] = useState('');
  const [guardianPhone, setGuardianPhone] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [street, setStreet] = useState('');
  const [streetNumber, setStreetNumber] = useState('');
  const [complement, setComplement] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [notes, setNotes] = useState('');

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!name || !email || !password || !documentCpf || !phone || !birthDate) {
      setError('Preencha os campos obrigatórios para continuar.');
      return;
    }

    if (password.length < 8) {
      setError('A senha deve ter pelo menos 8 caracteres.');
      return;
    }

    const payload: RegistrationPayload = {
      name,
      email,
      password,
      documentCpf,
      phone,
      birthDate,
      gender: gender || undefined,
      guardianName: guardianName || undefined,
      guardianPhone: guardianPhone || undefined,
      zipCode: zipCode || undefined,
      street: street || undefined,
      streetNumber: streetNumber || undefined,
      complement: complement || undefined,
      neighborhood: neighborhood || undefined,
      city: city || undefined,
      state: state || undefined,
      notes: notes || undefined,
    };

    setLoading(true);
    try {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const response = await fetch(`${API_BASE_URL}/mis/v1/public/cadastros`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        if (response.status === 429 && attempt === 0) {
          const retryAfter = Number(response.headers.get('retry-after') ?? '');
          const retryDelayMs =
            Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 900;
          await sleep(retryDelayMs);
          continue;
        }

        if (!response.ok) {
          throw new Error(await readError(response));
        }

        setSuccess('Cadastro realizado com sucesso. Faça login para acessar sua Área do Aluno.');
        setPassword('');
        return;
      }

      throw new Error('Limite de requisições atingido temporariamente.');
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : 'Não foi possível concluir o cadastro.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={`native-student-register ${embedded ? 'is-embedded' : ''}`}>
      <article className="native-student-register-card">
        <header>
          <h1>Cadastro de aluno</h1>
          <p>Preencha seus dados para criar o acesso à plataforma acadêmica.</p>
        </header>

        {error ? <p className="native-error">{error}</p> : null}
        {success ? (
          <p className="native-success">
            {success} <a href="/?embed=1&app=student">Ir para login</a>
          </p>
        ) : null}

        <form className="native-form-grid native-student-register-form" onSubmit={submit}>
          <label>
            Nome completo *
            <input
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            E-mail *
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Senha *
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            CPF *
            <input
              type="text"
              value={documentCpf}
              onChange={(event) => setDocumentCpf(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Telefone *
            <input
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Data de nascimento *
            <input
              type="date"
              value={birthDate}
              onChange={(event) => setBirthDate(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Gênero
            <select
              value={gender}
              onChange={(event) => setGender(event.target.value)}
              disabled={loading}
            >
              <option value="">Prefiro não informar</option>
              <option value="masculino">Masculino</option>
              <option value="feminino">Feminino</option>
              <option value="outro">Outro</option>
            </select>
          </label>

          <label>
            Nome do responsável
            <input
              type="text"
              value={guardianName}
              onChange={(event) => setGuardianName(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Telefone do responsável
            <input
              type="tel"
              value={guardianPhone}
              onChange={(event) => setGuardianPhone(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            CEP
            <input
              type="text"
              value={zipCode}
              onChange={(event) => setZipCode(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Rua
            <input
              type="text"
              value={street}
              onChange={(event) => setStreet(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Número
            <input
              type="text"
              value={streetNumber}
              onChange={(event) => setStreetNumber(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Complemento
            <input
              type="text"
              value={complement}
              onChange={(event) => setComplement(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Bairro
            <input
              type="text"
              value={neighborhood}
              onChange={(event) => setNeighborhood(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Cidade
            <input
              type="text"
              value={city}
              onChange={(event) => setCity(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Estado
            <input
              type="text"
              value={state}
              onChange={(event) => setState(event.target.value)}
              disabled={loading}
            />
          </label>

          <label className="full">
            Observações
            <textarea
              rows={3}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={loading}
            />
          </label>

          <div className="native-modal-actions">
            <a className="ghost" href="/?embed=1&app=student">
              Já tenho acesso
            </a>
            <button type="submit" disabled={loading}>
              {loading ? 'Cadastrando...' : 'Concluir cadastro'}
            </button>
          </div>
        </form>
      </article>
    </section>
  );
}
