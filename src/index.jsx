
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import '@rainbow-me/rainbowkit/styles.css'

import {
  RainbowKitProvider,
} from '@rainbow-me/rainbowkit'
import { WagmiProvider, createConfig, http } from 'wagmi'
import {
  mainnet,
  sepolia,
  baseSepolia,
} from 'wagmi/chains'
import {
  QueryClientProvider,
  QueryClient,
} from "@tanstack/react-query"
import { injected, metaMask, walletConnect } from 'wagmi/connectors'

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

const config = createConfig({
  chains: [monadTestnet, sepolia, baseSepolia],
  connectors: [
    injected({
      target: 'metaMask',
    }),
    metaMask(),
    walletConnect({ 
      projectId: '931ae2f446138b9d543f1fc72f30efb1',
      metadata: {
        name: 'Mon Bridge Dex',
        description: 'Cross Chain Bridge',
        url: 'https://monbridgedex.xyz',
        icons: ['https://monbridgedex.xyz/Tokenlogo.png']
      }
    })
  ],
  transports: {
    [monadTestnet.id]: http('https://testnet-rpc.monad.xyz'),
    [sepolia.id]: http('https://eth-sepolia.public.blastapi.io'),
    [baseSepolia.id]: http('https://sepolia.base.org'),
  },
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
