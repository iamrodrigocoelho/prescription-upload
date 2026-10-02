import { CircuitState } from 'cockatiel';
import { describe, expect, it, vi } from 'vitest';
import { PatientProvider, PatientProviderError, type PatientSummary } from './patient.provider.js';
import {
  type PatientProviderObserver,
  ResilientPatientProvider,
} from './resilient-patient.provider.js';

const SUMMARY: PatientSummary = {
  externalId: 'ext-1',
  displayName: 'João S.',
  cpfMasked: '***.***.***-12',
  phoneMasked: null,
  emailMasked: null,
};

/** Provider programável: cada chamada consome o próximo comportamento da fila. */
class ScriptedProvider extends PatientProvider {
  calls = 0;
  constructor(private readonly script: Array<() => Promise<PatientSummary[]>>) {
    super();
  }
  searchByCpf(): Promise<PatientSummary[]> {
    const step = this.script[Math.min(this.calls, this.script.length - 1)]!;
    this.calls += 1;
    return step();
  }
  searchByPhone(): Promise<PatientSummary[]> {
    return this.searchByCpf();
  }
  searchByEmail(): Promise<PatientSummary[]> {
    return this.searchByCpf();
  }
  findByExternalId(): Promise<PatientSummary | null> {
    return Promise.resolve(null);
  }
}

const ok = () => Promise.resolve([SUMMARY]);
const down = () => Promise.reject(new PatientProviderError('unavailable'));
const invalid = () => Promise.reject(new PatientProviderError('invalid'));
const hang = () => new Promise<PatientSummary[]>(() => undefined);
const crash = () => Promise.reject(new Error('resposta com CPF 52998224725'));

function observer(): PatientProviderObserver & {
  outcomes: string[];
  states: CircuitState[];
} {
  const outcomes: string[] = [];
  const states: CircuitState[] = [];
  return {
    outcomes,
    states,
    observe: (_op, outcome) => outcomes.push(outcome),
    error: vi.fn(),
    circuit: (state) => states.push(state),
  };
}

const options = {
  timeoutMs: 50,
  retries: 2,
  breakerThreshold: 3,
  halfOpenAfterMs: 200,
  initialBackoffMs: 1,
};

describe('ResilientPatientProvider', () => {
  it('repete leituras após falha transitória e devolve o resultado', async () => {
    const inner = new ScriptedProvider([down, down, ok]);
    const obs = observer();
    const provider = new ResilientPatientProvider(inner, options, obs);
    await expect(provider.searchByCpf('52998224725')).resolves.toEqual([SUMMARY]);
    expect(inner.calls).toBe(3);
    expect(obs.outcomes).toEqual(['ok']);
  });

  it('não repete erro de entrada inválida', async () => {
    const inner = new ScriptedProvider([invalid]);
    const provider = new ResilientPatientProvider(inner, options);
    await expect(provider.searchByEmail('x@example.com')).rejects.toMatchObject({
      kind: 'invalid',
    });
    expect(inner.calls).toBe(1);
  });

  it('aplica timeout por tentativa e normaliza como indisponível', async () => {
    const inner = new ScriptedProvider([hang]);
    const obs = observer();
    const provider = new ResilientPatientProvider(inner, { ...options, retries: 0 }, obs);
    await expect(provider.searchByPhone('21990000099')).rejects.toMatchObject({
      name: 'PatientProviderError',
      kind: 'unavailable',
    });
    expect(obs.outcomes).toEqual(['timeout']);
  });

  it('erro inesperado vira indisponível sem propagar a mensagem original', async () => {
    const inner = new ScriptedProvider([crash]);
    const provider = new ResilientPatientProvider(inner, { ...options, retries: 0 });
    const error = await provider.searchByCpf('52998224725').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(PatientProviderError);
    expect((error as Error).message).not.toContain('52998224725');
  });

  it('abre o circuito após falhas consecutivas e falha rápido sem chamar a API', async () => {
    const inner = new ScriptedProvider([down]);
    const obs = observer();
    const provider = new ResilientPatientProvider(inner, { ...options, retries: 0 }, obs);
    for (let i = 0; i < 3; i += 1) {
      await expect(provider.searchByCpf('52998224725')).rejects.toBeInstanceOf(
        PatientProviderError,
      );
    }
    expect(provider.circuitState).toBe(CircuitState.Open);
    const before = inner.calls;
    await expect(provider.searchByCpf('52998224725')).rejects.toMatchObject({
      kind: 'unavailable',
    });
    expect(inner.calls).toBe(before);
    expect(obs.outcomes.at(-1)).toBe('circuit_open');
    expect(obs.states).toContain(CircuitState.Open);
  });

  it('fecha o circuito quando a API volta (meio-aberto → fechado)', async () => {
    const inner = new ScriptedProvider([down, down, down, ok]);
    const provider = new ResilientPatientProvider(inner, { ...options, retries: 0 });
    for (let i = 0; i < 3; i += 1) await provider.searchByCpf('1').catch(() => undefined);
    expect(provider.circuitState).toBe(CircuitState.Open);
    await new Promise((resolve) => setTimeout(resolve, 250));
    await expect(provider.searchByCpf('1')).resolves.toEqual([SUMMARY]);
    expect(provider.circuitState).toBe(CircuitState.Closed);
  });

  it('findByCpf usa a correspondência inequívoca do adapter', async () => {
    const two = () => Promise.resolve([SUMMARY, { ...SUMMARY, externalId: 'ext-2' }]);
    const provider = new ResilientPatientProvider(new ScriptedProvider([two]), options);
    await expect(provider.findByCpf('52998224725')).resolves.toBeNull();
  });
});
