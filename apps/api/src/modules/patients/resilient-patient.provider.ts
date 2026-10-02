import {
  BrokenCircuitError,
  CircuitState,
  ConsecutiveBreaker,
  circuitBreaker,
  ExponentialBackoff,
  handleWhen,
  type IPolicy,
  retry,
  TaskCancelledError,
  timeout,
  TimeoutStrategy,
  wrap,
} from 'cockatiel';
import { PatientProvider, PatientProviderError, type PatientSummary } from './patient.provider.js';

export interface ResilienceOptions {
  /** Tempo máximo de cada tentativa. */
  timeoutMs: number;
  /** Novas tentativas após a primeira (somente leituras e falhas transitórias). */
  retries: number;
  /** Falhas transitórias consecutivas que abrem o circuito. */
  breakerThreshold: number;
  /** Tempo com o circuito aberto antes de testar de novo. */
  halfOpenAfterMs: number;
  /** Atraso inicial do backoff exponencial (com jitter). */
  initialBackoffMs?: number;
}

/** Observação sem dados pessoais: só operação, desfecho e duração. */
export interface PatientProviderObserver {
  observe(operation: string, outcome: string, seconds: number): void;
  error(operation: string, kind: string): void;
  circuit(state: CircuitState): void;
}

type Operation = 'searchByCpf' | 'searchByPhone' | 'searchByEmail' | 'findByCpf';

/** Falha transitória: indisponibilidade, timeout ou erro inesperado (rede, parse). */
function isTransient(error: unknown): boolean {
  if (error instanceof BrokenCircuitError) return false;
  if (error instanceof PatientProviderError) return error.kind === 'unavailable';
  return true;
}

function normalize(error: unknown): { error: PatientProviderError; outcome: string } {
  if (error instanceof PatientProviderError) return { error, outcome: error.kind };
  if (error instanceof BrokenCircuitError) {
    return {
      error: new PatientProviderError('unavailable', 'Circuito aberto.'),
      outcome: 'circuit_open',
    };
  }
  if (error instanceof TaskCancelledError) {
    return {
      error: new PatientProviderError('unavailable', 'Tempo esgotado.'),
      outcome: 'timeout',
    };
  }
  // A mensagem original não é propagada (poderia conter dados da resposta).
  return { error: new PatientProviderError('unavailable'), outcome: 'unavailable' };
}

/**
 * Decorator de resiliência aplicável a qualquer adapter (PRD §33, §40): timeout
 * curto por tentativa, retry com backoff só para leituras com falha transitória e
 * circuit breaker. Erros saem normalizados em `PatientProviderError`.
 * Todas as operações do contrato são leituras.
 */
export class ResilientPatientProvider extends PatientProvider {
  private readonly policy: IPolicy;
  private readonly breaker;

  constructor(
    private readonly inner: PatientProvider,
    options: ResilienceOptions,
    private readonly observer?: PatientProviderObserver,
  ) {
    super();
    this.breaker = circuitBreaker(handleWhen(isTransient), {
      halfOpenAfter: options.halfOpenAfterMs,
      breaker: new ConsecutiveBreaker(options.breakerThreshold),
    });
    this.breaker.onStateChange((state) => observer?.circuit(state));
    observer?.circuit(CircuitState.Closed);
    const retryPolicy = retry(handleWhen(isTransient), {
      maxAttempts: options.retries,
      backoff: new ExponentialBackoff({
        initialDelay: options.initialBackoffMs ?? 100,
        maxDelay: 1_000,
      }),
    });
    // Ordem: retry (externo) → breaker → timeout (por tentativa).
    this.policy = wrap(
      retryPolicy,
      this.breaker,
      timeout(options.timeoutMs, TimeoutStrategy.Aggressive),
    );
  }

  get circuitState(): CircuitState {
    return this.breaker.state;
  }

  searchByCpf(cpf: string): Promise<PatientSummary[]> {
    return this.run('searchByCpf', () => this.inner.searchByCpf(cpf));
  }

  searchByPhone(phone: string): Promise<PatientSummary[]> {
    return this.run('searchByPhone', () => this.inner.searchByPhone(phone));
  }

  searchByEmail(email: string): Promise<PatientSummary[]> {
    return this.run('searchByEmail', () => this.inner.searchByEmail(email));
  }

  override findByCpf(cpf: string): Promise<PatientSummary | null> {
    // Delega ao adapter (que pode ter consulta exata), com a mesma proteção.
    return this.run('findByCpf', () => this.inner.findByCpf(cpf));
  }

  private async run<T>(operation: Operation, call: () => Promise<T>): Promise<T> {
    const started = performance.now();
    const elapsed = () => (performance.now() - started) / 1000;
    try {
      const result = await this.policy.execute(call);
      this.observer?.observe(operation, 'ok', elapsed());
      return result;
    } catch (raw) {
      const { error, outcome } = normalize(raw);
      this.observer?.observe(operation, outcome, elapsed());
      this.observer?.error(operation, outcome);
      throw error;
    }
  }
}
