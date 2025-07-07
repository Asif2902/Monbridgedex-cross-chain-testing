import React, { useState, useEffect, useCallback } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain, useBalance, useWriteContract, useReadContract, useWaitForTransactionReceipt } from 'wagmi';
import { parseUnits, formatUnits, encodePacked, zeroAddress } from 'viem';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import './App.css';

const CONTRACTS = {
  monad: {
    name: 'Monad',
    tokenSymbol: 'MBD',
    logo: 'https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/MON.png/public',
    adapter: '0x0657DC3d2b431a1508a8335a4573b723604BFAB1',
    token: '0xBCDFD0c227D27D21424f6ff657A095b5978E96C2',
    chainIdHex: '0x279F',
    chainId: 10143,
    rpcUrl: 'https://testnet-rpc.monad.xyz',
    endpointId: 40204,
    layerzeroEndpoint: '0x6C7Ab2202C98C4227C5c46f1417D81144DA716Ff',
  },
  sepolia: {
    name: 'Sepolia',
    tokenSymbol: 'MBD',
    logo: 'https://imagedelivery.net/cBNDGgkrsEA-b_ixIp9SkQ/weth.jpg/public',
    adapter: '0x5eBbdAaA2C5715aC0c75cF14A5C92f1C59D3d181',
    token: '0x238dcDeBE64335355e4ed336e0a889EA5Cccf4ef',
    chainIdHex: '0xAA36A7',
    chainId: 11155111,
    rpcUrl: 'https://eth-sepolia.public.blastapi.io',
    endpointId: 40161,
    layerzeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
  },
  baseSepolia: {
    name: 'Base Sepolia',
    tokenSymbol: 'MBD',
    logo: 'https://raw.githubusercontent.com/base/brand-kit/refs/heads/main/logo/in-product/Base_Network_Logo.png',
    adapter: '0x7591EBf775157A443c505fbF8a49755c7ed3E338',
    token: '0x0B1272F34305084eD7AA468e0c63462e34f1B307',
    chainIdHex: '0x14A34',
    chainId: 84532,
    rpcUrl: 'https://sepolia.base.org',
    endpointId: 40245,
    layerzeroEndpoint: '0x6EDCE65403992e310A62460808c4b910D972f10f',
  }
};

const OFT_ADAPTER_ABI = [
  {
    "inputs": [
      {
        "components": [
          {"name": "dstEid", "type": "uint32"},
          {"name": "to", "type": "bytes32"},
          {"name": "amountLD", "type": "uint256"},
          {"name": "minAmountLD", "type": "uint256"},
          {"name": "extraOptions", "type": "bytes"},
          {"name": "composeMsg", "type": "bytes"},
          {"name": "oftCmd", "type": "bytes"}
        ],
        "name": "sendParam",
        "type": "tuple"
      },
      {
        "components": [
          {"name": "nativeFee", "type": "uint256"},
          {"name": "lzTokenFee", "type": "uint256"}
        ],
        "name": "fee",
        "type": "tuple"
      },
      {"name": "refundTo", "type": "address"}
    ],
    "name": "send",
    "outputs": [
      {
        "components": [
          {"name": "guid", "type": "bytes32"},
          {"name": "nativeFee", "type": "uint256"},
          {"name": "lzTokenFee", "type": "uint256"}
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      {
        "components": [
          {"name": "dstEid", "type": "uint32"},
          {"name": "to", "type": "bytes32"},
          {"name": "amountLD", "type": "uint256"},
          {"name": "minAmountLD", "type": "uint256"},
          {"name": "extraOptions", "type": "bytes"},
          {"name": "composeMsg", "type": "bytes"},
          {"name": "oftCmd", "type": "bytes"}
        ],
        "name": "sendParam",
        "type": "tuple"
      },
      {"name": "payInLzToken", "type": "bool"}
    ],
    "name": "quoteSend",
    "outputs": [
      {
        "components": [
          {"name": "nativeFee", "type": "uint256"},
          {"name": "lzTokenFee", "type": "uint256"}
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  }
];

const ERC20_ABI = [
  {
    "inputs": [{"name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "spender", "type": "address"},
      {"name": "amount", "type": "uint256"}
    ],
    "name": "approve",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "owner", "type": "address"},
      {"name": "spender", "type": "address"}
    ],
    "name": "allowance",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

const BUTTON_STATES = {
  CONNECT: 'Connect Wallet',
  CONNECTING: 'Connecting...',
  BRIDGE: 'Bridge Tokens',
  CHECKING_APPROVAL: 'Checking Approval...',
  APPROVING: 'Approving...',
  BRIDGING: 'Bridging...',
  SWITCHING_CHAIN: 'Switching Chain...'
};

const STORAGE_KEYS = {
  NOTIFICATIONS: 'bridgeNotifications',
  NOTIFICATION_COUNT: 'bridgeNotificationCount',
  WALLET_CONNECTED: 'walletConnected',
  WALLET_ADDRESS: 'walletAddress'
};

function App() {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContract } = useWriteContract();

  const [state, setState] = useState({
    fromChain: 'monad',
    toChain: 'sepolia'
  });
  const [notifications, setNotifications] = useState([]);
  const [amount, setAmount] = useState('');
  const [bridgeButtonText, setBridgeButtonText] = useState(BUTTON_STATES.BRIDGE);
  const [bridgeButtonDisabled, setBridgeButtonDisabled] = useState(false);
  const [connectButtonText, setConnectButtonText] = useState(BUTTON_STATES.CONNECT);
  const [connectButtonDisabled, setConnectButtonDisabled] = useState(false);
  const [needsChainSwitch, setNeedsChainSwitch] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showFromChainDropdown, setShowFromChainDropdown] = useState(false);
  const [showToChainDropdown, setShowToChainDropdown] = useState(false);
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false);
  const [estimatedGasCost, setEstimatedGasCost] = useState('--');
  const fromConfig = CONTRACTS[state.fromChain];
  const toConfig = CONTRACTS[state.toChain];

  // Get token balance for from chain
  const { data: fromTokenBalance } = useReadContract({
    address: fromConfig.token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address || zeroAddress],
    chainId: fromConfig.chainId,
  });

  const { data: fromTokenDecimals } = useReadContract({
    address: fromConfig.token,
    abi: ERC20_ABI,
    functionName: 'decimals',
    chainId: fromConfig.chainId,
  });

  // Get token balance for to chain
  const { data: toTokenBalance } = useReadContract({
    address: toConfig.token,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address || zeroAddress],
    chainId: toConfig.chainId,
  });

  const { data: toTokenDecimals } = useReadContract({
    address: toConfig.token,
    abi: ERC20_ABI,
    functionName: 'decimals',
    chainId: toConfig.chainId,
  });

  // Get allowance
  const { data: allowance } = useReadContract({
    address: fromConfig.token,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [address || zeroAddress, fromConfig.adapter],
    chainId: fromConfig.chainId,
  });

  // Get quote
  const amountLD = amount && fromTokenDecimals ? parseUnits(amount, fromTokenDecimals) : 0n;
  const gasLimit = 900000n;
  const extraOptions = gasLimit > 0 ? encodePacked(['uint16', 'uint256'], [1, gasLimit]) : '0x';

  const sendParam = {
    dstEid: toConfig.endpointId,
    to: address ? `0x${address.slice(2).padStart(64, '0')}` : '0x0000000000000000000000000000000000000000000000000000000000000000',
    amountLD,
    minAmountLD: amountLD,
    extraOptions,
    composeMsg: '0x',
    oftCmd: '0x'
  };

  const { data: quote } = useReadContract({
    address: fromConfig.adapter,
    abi: OFT_ADAPTER_ABI,
    functionName: 'quoteSend',
    args: [sendParam, false],
    chainId: fromConfig.chainId,
    query: { enabled: !!amount && !!address && parseFloat(amount) > 0 }
  });

  // Storage functions
  const saveNotificationsToStorage = useCallback((notifs) => {
    try {
      const serializedNotifications = JSON.stringify(notifs.map(n => ({
        ...n,
        timestamp: n.timestamp.toISOString()
      })));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, serializedNotifications);
      const unviewedCount = notifs.filter(n => !n.viewed).length;
      localStorage.setItem(STORAGE_KEYS.NOTIFICATION_COUNT, unviewedCount.toString());
    } catch (error) {
      console.error('Failed to save notifications to localStorage:', error);
    }
  }, []);

  const loadNotificationsFromStorage = useCallback(() => {
    try {
      const savedNotifications = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (savedNotifications) {
        const parsed = JSON.parse(savedNotifications);
        const processedNotifications = parsed.map(notification => ({
          ...notification,
          timestamp: new Date(notification.timestamp)
        }));
        setNotifications(processedNotifications);
        return processedNotifications;
      }
    } catch (error) {
      console.error('Failed to load notifications from localStorage:', error);
    }
    return [];
  }, []);

  // Utility functions
  const updateNotificationStatus = useCallback((txHash, newStatus) => {
    setNotifications(prevNotifications => {
      const updatedNotifications = prevNotifications.map(n => 
        n.txHash === txHash ? { ...n, status: newStatus } : n
      );
      setTimeout(() => saveNotificationsToStorage(updatedNotifications), 0);
      return updatedNotifications;
    });
  }, [saveNotificationsToStorage]);

  const addNotification = (fromChain, toChain, status, txHash, amountValue, errorMessage = null) => {
    const fromConfig = CONTRACTS[fromChain];
    const toConfig = CONTRACTS[toChain];

    const notification = {
      id: Date.now() + Math.random(),
      fromChain,
      toChain,
      fromLogo: fromConfig.logo,
      toLogo: toConfig.logo,
      fromName: fromConfig.name,
      toName: toConfig.name,
      status,
      txHash,
      amount: amountValue,
      timestamp: new Date(),
      viewed: false,
      errorMessage
    };

    setNotifications(prevNotifications => {
      const newNotifications = [notification, ...prevNotifications];
      setTimeout(() => saveNotificationsToStorage(newNotifications), 0);
      return newNotifications;
    });
  };

  const checkTransactionStatus = useCallback(async (txHash) => {
    try {
      const response = await fetch(`https://scan-testnet.layerzero-api.com/v1/messages/tx/${txHash}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transaction status');
      }
      const data = await response.json();

      if (data && data.data && data.data.length > 0) {
        const transaction = data.data[0];
        if (transaction.status && transaction.status.name) {
          return transaction.status.name.toUpperCase();
        }
        if (transaction.destination && transaction.destination.status) {
          return transaction.destination.status.toUpperCase();
        }
      }

      if (data && data.status) {
        return data.status.toUpperCase();
      }

      if (data && data.messages && data.messages.length > 0) {
        const message = data.messages[0];
        if (message.status) {
          return message.status.toUpperCase();
        }
      }

      return 'INFLIGHT';
    } catch (error) {
      console.error('Error checking transaction status:', error);
      return 'INFLIGHT';
    }
  }, []);

  const startStatusPolling = useCallback(() => {
    const interval = setInterval(async () => {
      const activeNotifications = notifications.filter(n => 
        ['INFLIGHT', 'CONFIRMING', 'PAYLOAD_STORED'].includes(n.status)
      );

      if (activeNotifications.length === 0) {
        return;
      }

      for (const notification of activeNotifications) {
        try {
          const status = await checkTransactionStatus(notification.txHash);
          if (status !== notification.status) {
            updateNotificationStatus(notification.txHash, status);
          }
        } catch (error) {
          console.error(`Error checking status for ${notification.txHash}:`, error);
        }
      }
    }, 2000);

    return interval;
  }, [notifications, checkTransactionStatus, updateNotificationStatus]);

  // Check if chain switch is needed
  useEffect(() => {
    if (isConnected && chainId) {
      const needsSwitch = chainId !== fromConfig.chainId;
      setNeedsChainSwitch(needsSwitch);

      if (needsSwitch) {
        setBridgeButtonText('Switch Chain');
      } else {
        setBridgeButtonText(BUTTON_STATES.BRIDGE);
      }
    }
  }, [isConnected, chainId, fromConfig.chainId]);

  // Update gas estimate
  useEffect(() => {
    if (quote && quote[0]) {
      const formattedFee = formatUnits(quote[0], 18);
      const nativeSymbol = fromConfig.name === 'Monad' ? 'MON' : 'ETH';
      setEstimatedGasCost(`~${parseFloat(formattedFee).toFixed(6)} ${nativeSymbol}`);
    } else {
      setEstimatedGasCost('--');
    }
  }, [quote, fromConfig.name]);

  // Load notifications on mount
  useEffect(() => {
    loadNotificationsFromStorage();
  }, [loadNotificationsFromStorage]);

  // Start status polling
  useEffect(() => {
    const activeCount = notifications.filter(n => 
      ['INFLIGHT', 'CONFIRMING', 'PAYLOAD_STORED'].includes(n.status)
    ).length;

    if (activeCount > 0) {
      const interval = startStatusPolling();
      return () => clearInterval(interval);
    }
  }, [notifications, startStatusPolling]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = () => {
      setShowFromChainDropdown(false);
      setShowToChainDropdown(false);
      setShowFromTokenDropdown(false);
      setShowNotifications(false);
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  

  const handleSwitchChain = async () => {
    try {
      setBridgeButtonText(BUTTON_STATES.SWITCHING_CHAIN);
      setBridgeButtonDisabled(true);

      await switchChain({ chainId: fromConfig.chainId });

      setTimeout(() => {
        setBridgeButtonText(BUTTON_STATES.BRIDGE);
        setBridgeButtonDisabled(false);
      }, 1000);
    } catch (error) {
      console.error('Chain switch failed:', error);
      setBridgeButtonText('Switch Chain');
      setBridgeButtonDisabled(false);
    }
  };

  const bridgeTokens = async () => {
    if (!isConnected || !address) {
      console.error('Please connect your wallet first');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      console.error('Please enter a valid amount.');
      return;
    }

    if (!fromTokenBalance || !fromTokenDecimals) {
      console.error('Unable to fetch token balance');
      return;
    }

    try {
      setBridgeButtonText('Starting Bridge...');
      setBridgeButtonDisabled(true);

      const amountLD = parseUnits(amount, fromTokenDecimals);

      if (fromTokenBalance < amountLD) {
        const formattedBalance = formatUnits(fromTokenBalance, fromTokenDecimals);
        throw new Error(`Insufficient balance: You have ${parseFloat(formattedBalance).toFixed(4)} MBD but need ${amount} MBD`);
      }

      if (!quote || !quote[0]) {
        throw new Error('Unable to get bridge quote');
      }

      const nativeFee = quote[0];

      // Check if approval is needed
      if (!allowance || allowance < amountLD) {
        setBridgeButtonText(BUTTON_STATES.APPROVING);

        const approveHash = await writeContract({
          address: fromConfig.token,
          abi: ERC20_ABI,
          functionName: 'approve',
          args: [fromConfig.adapter, amountLD],
        });

        // Wait for approval transaction
        setBridgeButtonText('Waiting for approval...');
        // You might want to use useWaitForTransactionReceipt hook here
        await new Promise(resolve => setTimeout(resolve, 3000)); // Simple delay for demo
      }

      setBridgeButtonText(BUTTON_STATES.BRIDGING);

      const hash = await writeContract({
        address: fromConfig.adapter,
        abi: OFT_ADAPTER_ABI,
        functionName: 'send',
        args: [sendParam, { nativeFee, lzTokenFee: 0n }, address],
        value: nativeFee,
      });

      addNotification(state.fromChain, state.toChain, 'CONFIRMING', hash, amount);

      setBridgeButtonText('Bridge Successful!');
      setTimeout(() => {
        setBridgeButtonText(BUTTON_STATES.BRIDGE);
        setBridgeButtonDisabled(false);
      }, 3000);

    } catch (error) {
      console.error('Bridge failed:', error);
      addNotification(state.fromChain, state.toChain, 'FAILED', 'no-tx-' + Date.now(), amount, error.message);

      setBridgeButtonText('Bridge Failed');
      setTimeout(() => {
        setBridgeButtonText(BUTTON_STATES.BRIDGE);
        setBridgeButtonDisabled(false);
      }, 3000);
    }
  };

  const handleMainAction = async () => {
    if (!isConnected) {
      handleConnect();
      return;
    }

    if (needsChainSwitch) {
      await handleSwitchChain();
    } else {
      await bridgeTokens();
    }
  };

  const swapChains = () => {
    setState({
      fromChain: state.toChain,
      toChain: state.fromChain
    });
    setAmount('');
  };

  const clearNotificationHistory = () => {
    setNotifications([]);
    setTimeout(() => saveNotificationsToStorage([]), 0);
  };

  const toggleNotifications = () => {
    const willShow = !showNotifications;
    setShowNotifications(willShow);

    if (willShow && notifications.some(n => !n.viewed)) {
      setNotifications(prevNotifications => {
        const updatedNotifications = prevNotifications.map(n => ({ ...n, viewed: true }));
        setTimeout(() => saveNotificationsToStorage(updatedNotifications), 0);
        return updatedNotifications;
      });
    }
  };

  const getTimeAgo = (timestamp) => {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  // Format balances
  const balance = fromTokenBalance && fromTokenDecimals ? 
    `${parseFloat(formatUnits(fromTokenBalance, fromTokenDecimals)).toFixed(4)} ${fromConfig.tokenSymbol}` : 
    '--';

  const destinationBalance = toTokenBalance && toTokenDecimals ? 
    `${parseFloat(formatUnits(toTokenBalance, toTokenDecimals)).toFixed(4)} ${toConfig.tokenSymbol}` : 
    '--';

  const unviewedCount = notifications.filter(n => !n.viewed).length;

  

  return (
    <div>
      <div className="background">
        <div className="orb"></div>
        <div className="orb"></div>
        <div className="orb"></div>
        <div className="orb"></div>
        <div className="orb"></div>
      </div>

      

      {/* Mobile Header */}
      <div className="mobile-header">
        <ConnectButton.Custom>
          {({
            account,
            chain,
            openAccountModal,
            openChainModal,
            openConnectModal,
            authenticationStatus,
            mounted,
          }) => {
            const ready = mounted && authenticationStatus !== 'loading';
            const connected =
              ready &&
              account &&
              chain &&
              (!authenticationStatus ||
                authenticationStatus === 'authenticated');
            return (
              <div
                {...(!ready && {
                  'aria-hidden': true,
                  'style': {
                    opacity: 0,
                    pointerEvents: 'none',
                    userSelect: 'none',
                  },
                })}
              >
                {(() => {
                  if (!connected) {
                    return (
                      <button
                        onClick={openConnectModal}
                        type="button"
                        className="mobile-header-wallet-button"
                      >
                        <div className="wallet-info">
                          <svg viewBox="0 0 24 24">
                            <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                          </svg>
                          Connect Wallet
                        </div>
                      </button>
                    );
                  }
                  return (
                    <button
                      onClick={openAccountModal}
                      type="button"
                      className="mobile-header-wallet-button connected"
                    >
                      <div className="wallet-info">
                        <div className="wallet-status">●</div>
                        <span>{account.displayName}</span>
                      </div>
                    </button>
                  );
                })()}
              </div>
            );
          }}
        </ConnectButton.Custom>
      </div>

      {/* Desktop Header */}
      <div className="desktop-header">
        <div className="header-content">
          <div className="header-nav">
            <a href="https://monbridgedex.xyz" className="nav-button">
              <svg viewBox="0 0 24 24">
                <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
              </svg>
              Home
            </a>
            <a href="https://monbridgedex.xyz/swap" className="nav-button">
              <svg viewBox="0 0 24 24">
                <path d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"/>
              </svg>
              Swap
            </a>
            <div className="nav-button active">
              <svg viewBox="0 0 24 24">
                <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
              </svg>
              Bridge
            </div>
          </div>
          <ConnectButton.Custom>
            {({
              account,
              chain,
              openAccountModal,
              openChainModal,
              openConnectModal,
              authenticationStatus,
              mounted,
            }) => {
              const ready = mounted && authenticationStatus !== 'loading';
              const connected =
                ready &&
                account &&
                chain &&
                (!authenticationStatus ||
                  authenticationStatus === 'authenticated');
              return (
                <div
                  {...(!ready && {
                    'aria-hidden': true,
                    'style': {
                      opacity: 0,
                      pointerEvents: 'none',
                      userSelect: 'none',
                    },
                  })}
                >
                  {(() => {
                    if (!connected) {
                      return (
                        <button
                          onClick={openConnectModal}
                          type="button"
                          className="header-wallet-button"
                        >
                          <div className="wallet-info">
                            <svg viewBox="0 0 24 24">
                              <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                            </svg>
                            Connect Wallet
                          </div>
                        </button>
                      );
                    }
                    return (
                      <button
                        onClick={openAccountModal}
                        type="button"
                        className="header-wallet-button connected"
                      >
                        <div className="wallet-info">
                          <div className="wallet-status">●</div>
                          <span>{account.displayName}</span>
                        </div>
                      </button>
                    );
                  })()}
                </div>
              );
            }}
          </ConnectButton.Custom>
        </div>
      </div>

      <div className="container">
        <div className="bridge-card">
          <div className="header">
            <h1>Mon Bridge DEX</h1>

            <button className="notification-bell" onClick={(e) => { e.stopPropagation(); toggleNotifications(); }}>
              <svg viewBox="0 0 24 24">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
              {unviewedCount > 0 && (
                <div className="notification-badge">{unviewedCount}</div>
              )}
            </button>

            {showNotifications && (
              <div className="notification-panel show">
                <div className="notification-header">
                  Bridge Transactions
                  <button className="clear-history" onClick={(e) => { e.stopPropagation(); clearNotificationHistory(); }}>
                    Clear
                  </button>
                </div>
                <div>
                  {notifications.length === 0 ? (
                    <div style={{padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem'}}>
                      No transactions yet
                    </div>
                  ) : (
                    notifications.map(notification => {
                      const getStatusClass = (status) => {
                        switch (status) {
                          case 'DELIVERED':
                            return 'status-delivered';
                          case 'FAILED':
                          case 'BLOCKED':
                          case 'APPLICATION_BURNED':
                          case 'UNRESOLVABLE_COMMAND':
                          case 'MALFORMED_COMMAND':
                            return 'status-failed';
                          case 'INFLIGHT':
                          case 'CONFIRMING':
                            return 'status-processing';
                          case 'PAYLOAD_STORED':
                            return 'status-stored';
                          case 'APPLICATION_SKIPPED':
                            return 'status-skipped';
                          default:
                            return 'status-processing';
                        }
                      };

                      const getStatusText = (status) => {
                        switch (status) {
                          case 'DELIVERED':
                            return 'View Scan';
                          case 'FAILED':
                            return 'Failed';
                          case 'BLOCKED':
return 'Blocked';
                          case 'INFLIGHT':
                            return 'In Flight';
                          case 'CONFIRMING':
                            return 'Confirming';
                          case 'PAYLOAD_STORED':
                            return 'Stored';
                          case 'APPLICATION_BURNED':
                            return 'Burned';
                          case 'APPLICATION_SKIPPED':
                            return 'Skipped';
                          case 'UNRESOLVABLE_COMMAND':
                            return 'Unresolvable';
                          case 'MALFORMED_COMMAND':
                            return 'Malformed';
                          default:
                            return 'Processing';
                        }
                      };

                      const statusClass = getStatusClass(notification.status);
                      const statusText = getStatusText(notification.status);

                      const handleClick = notification.txHash && !notification.txHash.startsWith('no-tx-') ? 
                        () => window.open(`https://testnet.layerzeroscan.com/tx/${notification.txHash}`, '_blank') : 
                        undefined;

                      return (
                        <div 
                          key={notification.id}
                          className="notification-item" 
                          onClick={handleClick}
                          style={handleClick ? {cursor: 'pointer'} : {}}
                        >
                          <div className="notification-route">
                            <div className="notification-logos">
                              <img src={notification.fromLogo} className="notification-logo" alt={notification.fromName} />
                              <span className="notification-arrow">→</span>
                              <img src={notification.toLogo} className="notification-logo" alt={notification.toName} />
                            </div>
                            <div style={{flex: 1, marginLeft: '8px'}}>
                              <div style={{fontSize: '0.8rem', fontWeight: 600}}>
                                {notification.fromName} → {notification.toName}
                              </div>
                              <div style={{fontSize: '0.7rem', color: 'var(--text-muted)'}}>
                                {notification.amount} MBD • {getTimeAgo(notification.timestamp)}
                              </div>
                              {notification.errorMessage && (
                                <div style={{fontSize: '0.65rem', color: 'var(--error-color)', marginTop: '2px', wordBreak: 'break-word'}}>
                                  {notification.errorMessage}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className={`notification-status ${statusClass}`}>{statusText}</div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          <div>
            {/* From Panel */}
            <div className="chain-panel">
              <div className="panel-header">
                <span className="panel-label">From</span>
                <span className="balance-info">Balance: {balance}</span>
              </div>

              <div className="selection-container">
                <div className="token-chain-row">
                  <div className="dropdown">
                    <div className="token-selector" onClick={(e) => { e.stopPropagation(); setShowFromTokenDropdown(!showFromTokenDropdown); }}>
                      <div className="selector-content">
                        <img src="https://monbridgedex.xyz/Tokenlogo.png" alt="MBD" className="token-logo" />
                        <div className="selector-text">
                          <span className="token-symbol">MBD</span>
                          <span className="selector-label">Token</span>
                        </div>
                      </div>
                      <svg className="dropdown-arrow" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {showFromTokenDropdown && (
                      <div className="dropdown-content show">
                        <div className="dropdown-item">
                          <img src="https://monbridgedex.xyz/Tokenlogo.png" alt="MBD" className="token-logo" />
                          <span>MBD</span>
                        </div>
                        <div className="dropdown-item coming-soon">
                          <div style={{width: '20px', height: '20px', background: '#6366f1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px'}}>?</div>
                          <span>More tokens</span>
                          <span className="coming-soon-badge">Soon</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="divider"></div>

                  <div className="dropdown">
                    <div className="chain-selector" onClick={(e) => { e.stopPropagation(); setShowFromChainDropdown(!showFromChainDropdown); }}>
                      <div className="selector-content">
                        <img src={fromConfig.logo} alt={fromConfig.name} className="chain-logo" />
                        <div className="selector-text">
                          <span className="chain-name">{fromConfig.name}</span>
                          <span className="selector-label">Chain</span>
                        </div>
                      </div>
                      <svg className="dropdown-arrow" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {showFromChainDropdown && (
                      <div className="dropdown-content show">
                        {Object.entries(CONTRACTS).map(([key, config]) => (
                          <div 
                            key={key}
                            className="dropdown-item" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (key !== state.toChain) {
                                setState({...state, fromChain: key});
                                setShowFromChainDropdown(false);
                              }
                            }}
                          >
                            <img src={config.logo} alt={config.name} className="chain-logo" />
                            <span>{config.name}</span>
                          </div>
                        ))}
                        <div className="dropdown-item coming-soon">
                          <div style={{width: '20px', height: '20px', background: '#6366f1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '8px'}}>?</div>
                          <span>More chains</span>
                          <span className="coming-soon-badge">Soon</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="percentage-buttons">
                <button 
                  className="percentage-button" 
                  onClick={() => {
                    if (fromTokenBalance && fromTokenDecimals) {
                      const balanceValue = parseFloat(formatUnits(fromTokenBalance, fromTokenDecimals));
                      const amount25 = (balanceValue * 0.25).toFixed(6);
                      setAmount(amount25.replace(/\.?0+$/, ''));
                    }
                  }}
                >
                  25%
                </button>
                <button 
                  className="percentage-button" 
                  onClick={() => {
                    if (fromTokenBalance && fromTokenDecimals) {
                      const balanceValue = parseFloat(formatUnits(fromTokenBalance, fromTokenDecimals));
                      const amount50 = (balanceValue * 0.5).toFixed(6);
                      setAmount(amount50.replace(/\.?0+$/, ''));
                    }
                  }}
                >
                  50%
                </button>
                <button 
                  className="percentage-button" 
                  onClick={() => {
                    if (fromTokenBalance && fromTokenDecimals) {
                      const balanceValue = parseFloat(formatUnits(fromTokenBalance, fromTokenDecimals));
                      setAmount(balanceValue.toString());
                    }
                  }}
                >
                  100%
                </button>
              </div>
              <div className="amount-section">
                <input 
                  type="number" 
                  className="amount-input" 
                  placeholder="0.0" 
                  step="any"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
            </div>

            {/* Swap Button */}
            <div className="swap-container">
              <button className="swap-button" onClick={swapChains} title="Swap chains">
                <svg viewBox="0 0 24 24">
                  <path d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"></path>
                </svg>
              </button>
            </div>

            {/* To Panel */}
            <div className="chain-panel">
              <div className="panel-header">
                <span className="panel-label">To</span>
                <span className="balance-info">Balance: {destinationBalance}</span>
              </div>

              <div className="selection-container">
                <div className="token-chain-row">
                  <div className="token-selector">
                    <div className="selector-content">
                      <img src="https://monbridgedex.xyz/Tokenlogo.png" alt="MBD" className="token-logo" />
                      <div className="selector-text">
                        <span className="token-symbol">MBD</span>
                        <span className="selector-label">Token</span>
                      </div>
                    </div>
                  </div>

                  <div className="divider"></div>

                  <div className="dropdown">
                    <div className="chain-selector" onClick={(e) => { e.stopPropagation(); setShowToChainDropdown(!showToChainDropdown); }}>
                      <div className="selector-content">
                        <img src={toConfig.logo} alt={toConfig.name} className="chain-logo" />
                        <div className="selector-text">
                          <span className="chain-name">{toConfig.name}</span>
                          <span className="selector-label">Chain</span>
                        </div>
                      </div>
                      <svg className="dropdown-arrow" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </div>
                    {showToChainDropdown && (
                      <div className="dropdown-content show">
                        {Object.entries(CONTRACTS).map(([key, config]) => (
                          <div 
                            key={key}
                            className="dropdown-item" 
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if (key !== state.fromChain) {
                                setState({...state, toChain: key});
                                setShowToChainDropdown(false);
                              }
                            }}
                          >
                            <img src={config.logo} alt={config.name} className="chain-logo" />
                            <span>{config.name}</span>
                          </div>
                        ))}
                        <div className="dropdown-item coming-soon">
                          <div style={{width: '20px', height: '20px', background: '#6366f1', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '8px'}}>?</div>
                          <span>More chains</span>
                          <span className="coming-soon-badge">Soon</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="amount-section">
                <input 
                  type="number" 
                  className="amount-input to-amount-input" 
                  placeholder="0.0" 
                  step="any"
                  value={amount || ''}
                  readOnly
                />
              </div>

              <div className="gas-estimate">
                <span className="gas-label">Estimated bridge cost:</span>
                <span className="gas-cost">{estimatedGasCost}</span>
              </div>
            </div>

            {!isConnected ? (
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button 
                    className="action-button connect" 
                    onClick={openConnectModal}
                    type="button"
                  >
                    Connect Wallet
                  </button>
                )}
              </ConnectButton.Custom>
            ) : (
              <button 
                className="action-button bridge" 
                onClick={handleMainAction}
                disabled={bridgeButtonDisabled}
              >
                {bridgeButtonText}
              </button>
            )}

            <div className="bridge-footer">
              <div className="footer-text">Cross Chain Bridge</div>
              <div className="footer-text powered">Powered by LayerZero</div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Footer Navigation */}
      <div className="mobile-footer">
        <div className="footer-nav">
          <a href="https://monbridgedex.xyz" className="footer-nav-item">
            <svg viewBox="0 0 24 24">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
            Home
          </a>
          <a href="https://monbridgedex.xyz/swap" className="footer-nav-item">
            <svg viewBox="0 0 24 24">
              <path d="M16 17.01V10h-2v7.01h-3L15 21l4-3.99h-3zM9 3L5 6.99h3V14h2V6.99h3L9 3z"/>
            </svg>
            Swap
          </a>
          <div className="footer-nav-item active">
            <svg viewBox="0 0 24 24">
              <path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
            </svg>
            Bridge
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;