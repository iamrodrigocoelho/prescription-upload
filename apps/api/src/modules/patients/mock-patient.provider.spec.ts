import { describePatientProviderContract } from '../../../test/contracts/patient-provider.contract.js';
import { MOCK_PATIENTS, MockPatientProvider } from './mock-patient.provider.js';
import { ResilientPatientProvider } from './resilient-patient.provider.js';

const fixtures = {
  uniqueCpf: MOCK_PATIENTS[0]!.cpf,
  unknownCpf: '52998224725',
  sharedPhone: '21990000099',
  knownEmail: 'familia@example.com',
  unknownEmail: 'ninguem@example.com',
};

describePatientProviderContract('mock', () => new MockPatientProvider(), fixtures);

describePatientProviderContract(
  'mock com resiliência',
  () =>
    new ResilientPatientProvider(new MockPatientProvider(), {
      timeoutMs: 500,
      retries: 1,
      breakerThreshold: 3,
      halfOpenAfterMs: 1_000,
    }),
  fixtures,
);
