
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@rainbow-me/rainbowkit/styles.css'

import {
  getDefaultConfig,
  RainbowKitProvider,
  getDefaultWallets,
  connectorsForWallets,
} from '@rainbow-me/rainbowkit'
import { WagmiProvider } from 'wagmi'
import {
  mainnet,
  sepolia,
  baseSepolia,
} from 'wagmi/chains'
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query"
import {
  injectedWallet,
  metaMaskWallet,
  walletConnectWallet,
  rabbyWallet,
  coinbaseWallet,
  trustWallet,
} from '@rainbow-me/rainbowkit/wallets'

// Define Monad testnet chain
const monadTestnet = {
  id: 10143,
  name: 'Monad',
  nativeCurrency: {
    decimals: 18,
    name: 'MON',
    symbol: 'MON',
  },
  rpcUrls: {
    default: {
      http: ['https://testnet-rpc.monad.xyz'],
    },
  },
  blockExplorers: {
    default: { name: 'Monad Explorer', url: 'https://testnet-explorer.monad.xyz' },
  },
  testnet: true,
}

const wallets = [
  {
    groupName: 'Recommended',
    wallets: [
      injectedWallet,
      metaMaskWallet,
      walletConnectWallet,
      rabbyWallet,
      coinbaseWallet,
      trustWallet,
    ],
  },
];

const connectors = connectorsForWallets(wallets, {
  appName: 'Mon Bridge Dex',
  projectId: '931ae2f446138b9d543f1fc72f30efb1',
});

const config = getDefaultConfig({
  appName: 'Mon Bridge Dex',
  projectId: '931ae2f446138b9d543f1fc72f30efb1',
  chains: [monadTestnet, sepolia, baseSepolia],
  connectors,
  ssr: false,
})

const queryClient = new QueryClient()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider>
          <App />
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>
)
