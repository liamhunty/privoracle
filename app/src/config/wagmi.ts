import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { sepolia } from 'wagmi/chains';

export const config = getDefaultConfig({
  appName: 'PrivOracle',
  projectId: '00000000000000000000000000000000',
  chains: [sepolia],
  ssr: false,
});
