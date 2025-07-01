
import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { mainnet, sepolia, baseSepolia } from 'wagmi/chains';

// Define Monad testnet chain
const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  iconUrl: 'https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/MON.png/public',
  iconBackground: '#000',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://explorer-testnet.monad.xyz' },
  },
  testnet: true,
};

export const config = getDefaultConfig({
  appName: 'Mon Bridge DEX',
  projectId: 'fd923eab39a4ca459b3fa3def4c77a70',
  chains: [monadTestnet, sepolia, baseSepolia],
  ssr: false,
});
