import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
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
  'function send((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, (uint256 nativeFee, uint256 lzTokenFee) fee, address refundTo) payable returns ((bytes32 guid, uint256 nativeFee, uint256 lzTokenFee))',
  'function quoteSend((uint32 dstEid, bytes32 to, uint256 amountLD, uint256 minAmountLD, bytes extraOptions, bytes composeMsg, bytes oftCmd) sendParam, bool payInLzToken) view returns ((uint256 nativeFee, uint256 lzTokenFee))'
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
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
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [currentAccount, setCurrentAccount] = useState(null);
  const [state, setState] = useState({
    fromChain: 'monad',
    toChain: 'sepolia'
  });
  const [notifications, setNotifications] = useState([]);
  const [amount, setAmount] = useState('');
  const [balance, setBalance] = useState('--');
  const [destinationBalance, setDestinationBalance] = useState('--');
  const [bridgeButtonText, setBridgeButtonText] = useState(BUTTON_STATES.BRIDGE);
  const [bridgeButtonDisabled, setBridgeButtonDisabled] = useState(false);
  const [connectButtonText, setConnectButtonText] = useState(BUTTON_STATES.CONNECT);
  const [connectButtonDisabled, setConnectButtonDisabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [needsChainSwitch, setNeedsChainSwitch] = useState(false);
  const [currentChainId, setCurrentChainId] = useState(null);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showFromChainDropdown, setShowFromChainDropdown] = useState(false);
  const [showToChainDropdown, setShowToChainDropdown] = useState(false);
  const [showFromTokenDropdown, setShowFromTokenDropdown] = useState(false);

  // Storage functions first
  const saveNotificationsToStorage = useCallback((notifs) => {
    try {
      const serializedNotifications = JSON.stringify(notifs.map(n => ({
        ...n,
        timestamp: n.timestamp.toISOString()
      })));
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, serializedNotifications);
      const unviewedCount = notifs.filter(n => !n.viewed).length;
      localStorage.setItem(STORAGE_KEYS.NOTIFICATION_COUNT, unviewedCount.toString());
      console.log('Notifications saved to storage:', notifs.length);
    } catch (error) {
      console.error('Failed to save notifications to localStorage:', error);
    }
  }, []);

  // Utility functions
  const updateNotificationStatus = useCallback((txHash, newStatus) => {
    console.log('Updating notification status:', txHash, newStatus);

    setNotifications(prevNotifications => {
      const updatedNotifications = prevNotifications.map(n => 
        n.txHash === txHash ? { ...n, status: newStatus } : n
      );
      // Save to storage after state update
      setTimeout(() => saveNotificationsToStorage(updatedNotifications), 0);
      return updatedNotifications;
    });
  }, []);

  // Transaction status checking
  const checkTransactionStatus = useCallback(async (txHash) => {
    try {
      const response = await fetch(`https://scan-testnet.layerzero-api.com/v1/messages/tx/${txHash}`);
      if (!response.ok) {
        throw new Error('Failed to fetch transaction status');
      }
      const data = await response.json();

      // Check if the response has data array with transaction info
      if (data && data.data && data.data.length > 0) {
        const transaction = data.data[0];

        // Check for status.name field (new API structure)
        if (transaction.status && transaction.status.name) {
          return transaction.status.name.toUpperCase();
        }

        // Fallback: check destination status for more specific status
        if (transaction.destination && transaction.destination.status) {
          return transaction.destination.status.toUpperCase();
        }
      }

      // Legacy fallback for old API structure
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
            console.log(`Status update for ${notification.txHash}: ${notification.status} -> ${status}`);
            updateNotificationStatus(notification.txHash, status);

            // Refresh balances when cross-chain transaction is delivered
            if (status === 'DELIVERED') {
              setTimeout(() => {
                updateBalance();
              }, 3000);
            }
          }
        } catch (error) {
          console.error(`Error checking status for ${notification.txHash}:`, error);
        }
      }
    }, 2000); // Check every 2 seconds

    return interval;
  }, [notifications, checkTransactionStatus, updateNotificationStatus]);

  // Utility functions
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

  const loadNotificationsFromStorage = useCallback(() => {
    try {
      const savedNotifications = localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS);
      if (savedNotifications) {
        const parsed = JSON.parse(savedNotifications);
        const processedNotifications = parsed.map(notification => ({
          ...notification,
          timestamp: new Date(notification.timestamp)
        }));
        console.log('Notifications loaded from storage:', processedNotifications.length);
        setNotifications(processedNotifications);
        return processedNotifications;
      }
    } catch (error) {
      console.error('Failed to load notifications from localStorage:', error);
    }
    return [];
  }, []);

  const saveWalletConnection = (address) => {
    try {
      localStorage.setItem(STORAGE_KEYS.WALLET_CONNECTED, 'true');
      localStorage.setItem(STORAGE_KEYS.WALLET_ADDRESS, address);
    } catch (error) {
      console.warn('Failed to save wallet connection:', error);
    }
  };

  const loadWalletConnection = () => {
    try {
      const isWalletConnected = localStorage.getItem(STORAGE_KEYS.WALLET_CONNECTED) === 'true';
      const savedAddress = localStorage.getItem(STORAGE_KEYS.WALLET_ADDRESS);
      return { isConnected: isWalletConnected, savedAddress };
    } catch (error) {
      console.warn('Failed to load wallet connection:', error);
      return { isConnected: false, savedAddress: null };
    }
  };

  const clearWalletConnection = () => {
    try {
      localStorage.removeItem(STORAGE_KEYS.WALLET_CONNECTED);
      localStorage.removeItem(STORAGE_KEYS.WALLET_ADDRESS);
    } catch (error) {
      console.warn('Failed to clear wallet connection:', error);
    }
  };

  const addNotification = (fromChain, toChain, status, txHash, amountValue, errorMessage = null) => {
    const fromConfig = CONTRACTS[fromChain];
    const toConfig = CONTRACTS[toChain];

    const notification = {
      id: Date.now() + Math.random(), // Ensure unique ID
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

    console.log('Adding notification:', notification);

    setNotifications(prevNotifications => {
      const newNotifications = [notification, ...prevNotifications];
      // Save to storage after state update
      setTimeout(() => saveNotificationsToStorage(newNotifications), 0);
      return newNotifications;
    });
  };

  const updateNotificationWithError = useCallback((txHash, errorMessage) => {
    console.log('Updating notification with error:', txHash, errorMessage);

    setNotifications(prevNotifications => {
      const updatedNotifications = prevNotifications.map(n => 
        n.txHash === txHash ? { ...n, status: 'FAILED', errorMessage } : n
      );
      // Save to storage after state update
      setTimeout(() => saveNotificationsToStorage(updatedNotifications), 0);
      return updatedNotifications;
    });
  }, [saveNotificationsToStorage]);



  const checkCurrentChain = useCallback(async () => {
    if (!provider) {
      setCurrentChainId(null);
      setNeedsChainSwitch(false);
      return;
    }

    try {
      const network = await provider.getNetwork();
      const chainId = Number(network.chainId);
      setCurrentChainId(chainId);

      const fromConfig = CONTRACTS[state.fromChain];
      const needsSwitch = chainId !== fromConfig.chainId;
      setNeedsChainSwitch(needsSwitch);

      if (needsSwitch) {
        setBridgeButtonText('Switch Chain');
      } else {
        setBridgeButtonText(BUTTON_STATES.BRIDGE);
      }
    } catch (error) {
      console.error('Error checking current chain:', error);
      setNeedsChainSwitch(false);
    }
  }, [provider, state.fromChain]);

  const updateBalance = useCallback(async () => {
    if (!currentAccount) {
      setBalance('--');
      setDestinationBalance('--');
      return;
    }

    try {
      // Update source chain balance
      const fromConfig = CONTRACTS[state.fromChain];
      const fromChainProvider = new ethers.JsonRpcProvider(fromConfig.rpcUrl);
      const fromToken = new ethers.Contract(fromConfig.token, ERC20_ABI, fromChainProvider);
      const [fromTokenBalance, fromDecimals] = await Promise.all([
        fromToken.balanceOf(currentAccount), 
        fromToken.decimals()
      ]);
      const formattedFromBalance = ethers.formatUnits(fromTokenBalance, fromDecimals);
      setBalance(`${parseFloat(formattedFromBalance).toFixed(4)} ${fromConfig.tokenSymbol}`);

      // Update destination chain balance
      const toConfig = CONTRACTS[state.toChain];
      const toChainProvider = new ethers.JsonRpcProvider(toConfig.rpcUrl);
      const toToken = new ethers.Contract(toConfig.token, ERC20_ABI, toChainProvider);
      const [toTokenBalance, toDecimals] = await Promise.all([
        toToken.balanceOf(currentAccount), 
        toToken.decimals()
      ]);
      const formattedToBalance = ethers.formatUnits(toTokenBalance, toDecimals);
      setDestinationBalance(`${parseFloat(formattedToBalance).toFixed(4)} ${toConfig.tokenSymbol}`);
    } catch (error) {
      console.error('Error updating balances:', error);
      setBalance('Error loading');
      setDestinationBalance('Error loading');
    }
  }, [currentAccount, state.fromChain, state.toChain]);

  const switchToChain = async (chainKey) => {
    if (!provider) return false;

    const targetChainId = CONTRACTS[chainKey].chainId;
    const network = await provider.getNetwork();

    if (network.chainId === BigInt(targetChainId)) {
      return true; // Already on correct chain
    }

    try {
      setBridgeButtonText(BUTTON_STATES.SWITCHING_CHAIN);
      setBridgeButtonDisabled(true);

      await window.ethereum.request({ 
        method: 'wallet_switchEthereumChain', 
        params: [{ chainId: CONTRACTS[chainKey].chainIdHex }] 
      });

      // Wait for the network to fully switch
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Create new provider and signer instances
      const newProvider = new ethers.BrowserProvider(window.ethereum);
      const newSigner = await newProvider.getSigner();

      // Verify the chain switch was successful
      const newNetwork = await newProvider.getNetwork();
      if (newNetwork.chainId !== BigInt(targetChainId)) {
        throw new Error('Chain switch verification failed');
      }

      setProvider(newProvider);
      setSigner(newSigner);
      setCurrentChainId(Number(newNetwork.chainId));
      setNeedsChainSwitch(false);
      setBridgeButtonText(BUTTON_STATES.BRIDGE);

      console.log(`Successfully switched to ${CONTRACTS[chainKey].name} (Chain ID: ${newNetwork.chainId})`);

      // Update balance after successful chain switch
      setTimeout(() => {
        updateBalance();
      }, 500);

      return true;

    } catch (error) {
      if (error.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: CONTRACTS[chainKey].chainIdHex, 
              chainName: CONTRACTS[chainKey].name, 
              rpcUrls: [CONTRACTS[chainKey].rpcUrl],
              nativeCurrency: { 
                name: chainKey === 'monad' ? 'MON' : 'ETH', 
                symbol: chainKey === 'monad' ? 'MON' : 'ETH', 
                decimals: 18 
              }
            }]
          });

          // Wait for the network to be added and switch
          await new Promise(resolve => setTimeout(resolve, 3000));

          const newProvider = new ethers.BrowserProvider(window.ethereum);
          const newSigner = await newProvider.getSigner();

          // Verify the chain addition and switch was successful
          const newNetwork = await newProvider.getNetwork();
          if (newNetwork.chainId !== BigInt(targetChainId)) {
            throw new Error('Chain addition verification failed');
          }

          setProvider(newProvider);
          setSigner(newSigner);
          setCurrentChainId(Number(newNetwork.chainId));
          setNeedsChainSwitch(false);
          setBridgeButtonText(BUTTON_STATES.BRIDGE);

          console.log(`Successfully added and switched to ${CONTRACTS[chainKey].name}`);

          // Update balance after successful chain addition
          setTimeout(() => {
            updateBalance();
          }, 500);

          return true;

        } catch (addError) {
          console.error('Failed to add chain:', addError);
          const errorMsg = `Failed to add ${CONTRACTS[chainKey].name} chain. Please add it manually.`;
          setBridgeButtonText('Switch Chain');
          setBridgeButtonDisabled(false);
          throw new Error(errorMsg);
        }
      } else if (error.code === 4001) {
        const errorMsg = `User rejected switching to ${CONTRACTS[chainKey].name} chain`;
        setBridgeButtonText('Switch Chain');
        setBridgeButtonDisabled(false);
        return false;
      } else {
        console.error('Failed to switch chain:', error);
        const errorMsg = `Failed to switch to ${CONTRACTS[chainKey].name} chain: ${error.message}`;
        setBridgeButtonText('Switch Chain');
        setBridgeButtonDisabled(false);
        throw new Error(errorMsg);
      }
    } finally {
      setBridgeButtonDisabled(false);
    }
  };

  const connectWallet = async () => {
    if (!window.ethereum) {
      console.error('MetaMask is not installed.');
      return;
    }

    try {
      setConnectButtonText(BUTTON_STATES.CONNECTING);
      setConnectButtonDisabled(true);

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const account = ethers.getAddress(accounts[0]);
      const newProvider = new ethers.BrowserProvider(window.ethereum);
      const newSigner = await newProvider.getSigner();

      setCurrentAccount(account);
      setProvider(newProvider);
      setSigner(newSigner);
      setIsConnected(true);

      // Reset button states after successful connection
      setConnectButtonText(BUTTON_STATES.CONNECT);
      setConnectButtonDisabled(false);
      setBridgeButtonText(BUTTON_STATES.BRIDGE);
      setBridgeButtonDisabled(false);

      saveWalletConnection(account);
      console.log(`Wallet connected: ${account}`);

      // Setup event listeners
      window.ethereum.on('accountsChanged', async (accounts) => {
        if (accounts.length === 0) {
          setCurrentAccount(null);
          setSigner(null);
          setIsConnected(false);
          clearWalletConnection();
          setConnectButtonText(BUTTON_STATES.CONNECT);
          setConnectButtonDisabled(false);
          console.log('Wallet disconnected.');
        } else {
          const newAccount = ethers.getAddress(accounts[0]);
          if (newAccount !== currentAccount) {
            setCurrentAccount(newAccount);
            saveWalletConnection(newAccount);
            console.log(`Account changed to: ${newAccount}`);
          }
        }
      });

      window.ethereum.on('chainChanged', async () => {
        if (provider) {
          const newProvider = new ethers.BrowserProvider(window.ethereum);
          const newSigner = await newProvider.getSigner();
          setProvider(newProvider);
          setSigner(newSigner);

          // Check if we need to switch chain after network change
          setTimeout(() => {
            checkCurrentChain();
            updateBalance();
          }, 1000);
        }
      });

    } catch (error) {
      console.error(`Failed to connect wallet: ${error.message}`);
      setConnectButtonText(BUTTON_STATES.CONNECT);
      setConnectButtonDisabled(false);
    }
  };

  const bridgeTokens = async () => {
    if (!signer) {
      console.error('Please connect your wallet first');
      return;
    }

    const amountStr = amount;
    if (!amountStr || parseFloat(amountStr) <= 0) {
      console.error('Please enter a valid amount.');
      return;
    }

    let tempTxHash = null;

    try {
      const fromConfig = CONTRACTS[state.fromChain];
      const toConfig = CONTRACTS[state.toChain];

      console.log(`Starting bridge: ${amountStr} tokens from ${fromConfig.name} to ${toConfig.name}.`);

      // Verify we're on the correct chain before proceeding
      const currentNetwork = await provider.getNetwork();
      if (currentNetwork.chainId !== BigInt(fromConfig.chainId)) {
        throw new Error(`Please switch to ${fromConfig.name} network first`);
      }

      const adapter = new ethers.Contract(fromConfig.adapter, OFT_ADAPTER_ABI, signer);
      const token = new ethers.Contract(fromConfig.token, ERC20_ABI, signer);

      const decimals = await token.decimals();
      const amountLD = ethers.parseUnits(amountStr, decimals);

      const tokenBalance = await token.balanceOf(currentAccount);
      if (tokenBalance < amountLD) {
        const formattedBalance = ethers.formatUnits(tokenBalance, decimals);
        throw new Error(`Insufficient balance: You have ${parseFloat(formattedBalance).toFixed(4)} MBD but need ${amountStr} MBD`);
      }

      console.log('Getting bridge quote...');
      setBridgeButtonText('Getting Quote...');
      setBridgeButtonDisabled(true);

      const gasLimit = 900000n;
      const extraOptions = ethers.solidityPacked(['uint16', 'uint256'], [1, gasLimit]);

      const sendParam = {
        dstEid: toConfig.endpointId,
        to: ethers.zeroPadValue(currentAccount, 32),
        amountLD, 
        minAmountLD: amountLD,
        extraOptions: extraOptions,
        composeMsg: '0x', 
        oftCmd: '0x'
      };

      const [nativeFee] = await adapter.quoteSend(sendParam, false);
      console.log(`Quote: ${ethers.formatEther(nativeFee)} ${fromConfig.name === 'Monad' ? 'MON' : 'ETH'}`);

      const nativeBalance = await provider.getBalance(currentAccount);
      if (nativeBalance < nativeFee) {
        const nativeSymbol = fromConfig.name === 'Monad' ? 'MON' : 'ETH';
        const requiredAmount = ethers.formatEther(nativeFee);
        const currentAmount = ethers.formatEther(nativeBalance);
        throw new Error(`Insufficient gas: You need ${parseFloat(requiredAmount).toFixed(6)} ${nativeSymbol} but only have ${parseFloat(currentAmount).toFixed(6)} ${nativeSymbol}`);
      }

      setBridgeButtonText(BUTTON_STATES.CHECKING_APPROVAL);
      console.log('Checking token approval...');

      const allowance = await token.allowance(currentAccount, fromConfig.adapter);
      if (allowance < amountLD) {
        setBridgeButtonText(BUTTON_STATES.APPROVING);
        console.log('Approving tokens...');

        const approveTx = await token.approve(fromConfig.adapter, amountLD);
        await approveTx.wait();
        console.log('Token approval confirmed');
      }

      setBridgeButtonText(BUTTON_STATES.BRIDGING);
      console.log('Sending bridge transaction...');

      const tx = await adapter.send(
        sendParam, 
        { nativeFee, lzTokenFee: 0n }, 
        currentAccount, 
        { value: nativeFee }
      );
      console.log(`Transaction sent: ${tx.hash}`);
      tempTxHash = tx.hash;

      setBridgeButtonText('Confirming...');

      addNotification(state.fromChain, state.toChain, 'CONFIRMING', tx.hash, amountStr);

      const receipt = await tx.wait();
      console.log(`Transaction confirmed! Gas used: ${receipt.gasUsed}`);

      const lzScanUrl = `https://testnet.layerzeroscan.com/tx/${receipt.hash}`;
      console.log(`View on LayerZero Scan: ${lzScanUrl}`);

      updateNotificationStatus(receipt.hash, 'INFLIGHT');

      // Refresh balances immediately after source chain confirmation
      setTimeout(() => {
        updateBalance();
      }, 2000);

      setBridgeButtonText('Bridge Successful!');
      setTimeout(() => {
        setBridgeButtonText(BUTTON_STATES.BRIDGE);
        setBridgeButtonDisabled(false);
      }, 3000);

    } catch (error) {
      let errorMessage = error.message || 'Unknown error';
      let userFriendlyError = errorMessage;

      // Handle specific error codes
      if (error.data) {
        const errorMap = {
          '0x41705130': 'Invalid option format - Transaction parameters not supported',
          '0xc0927c56': `Destination chain not configured - Cannot bridge to ${CONTRACTS[state.toChain].name}`,
          '0x6592671c': 'Insufficient fee provided for cross-chain transaction'
        };

        const selector = error.data.slice(0, 10);
        userFriendlyError = errorMap[selector] || `Smart contract error: ${selector}`;
      }

      // Handle common wallet errors
      if (error.code === 4001) {
        userFriendlyError = 'Transaction rejected by user';
      } else if (error.code === -32603) {
        userFriendlyError = 'Internal JSON-RPC error - Please try again';
      } else if (error.code === 4902) {
        userFriendlyError = `Please add ${CONTRACTS[state.fromChain].name} network to your wallet`;
      } else if (error.message?.includes('user rejected')) {
        userFriendlyError = 'Transaction rejected by user';
      } else if (error.message?.includes('insufficient funds')) {
        userFriendlyError = 'Insufficient funds for gas fees';
      } else if (error.message?.includes('network changed')) {
        userFriendlyError = `Please switch to ${CONTRACTS[state.fromChain].name} network`;
      }

      console.error(`Bridge failed: ${errorMessage}`);

      // Update notification with error if transaction was created
      if (tempTxHash) {
        updateNotificationWithError(tempTxHash, userFriendlyError);
      } else {
        // Add error notification if no transaction was created
        addNotification(state.fromChain, state.toChain, 'FAILED', 'no-tx-' + Date.now(), amountStr, userFriendlyError);
      }

      setBridgeButtonText('Bridge Failed');
      setTimeout(() => {
        setBridgeButtonText(BUTTON_STATES.BRIDGE);
        setBridgeButtonDisabled(false);
      }, 3000);
    }
  };

  const handleMainAction = async () => {
    if (!isConnected) {
      await connectWallet();
      return;
    }

    if (needsChainSwitch) {
      try {
        await switchToChain(state.fromChain);
      } catch (error) {
        console.error('Chain switch failed:', error);
      }
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
    console.log(`Swapped: ${CONTRACTS[state.toChain].name} → ${CONTRACTS[state.fromChain].name}`);
  };

  const clearNotificationHistory = () => {
    console.log('Clearing notification history');
    setNotifications([]);
    setTimeout(() => saveNotificationsToStorage([]), 0);
  };

  const toggleNotifications = () => {
    const willShow = !showNotifications;
    setShowNotifications(willShow);

    if (willShow && notifications.some(n => !n.viewed)) {
      console.log('Marking notifications as viewed');
      setNotifications(prevNotifications => {
        const updatedNotifications = prevNotifications.map(n => ({ ...n, viewed: true }));
        setTimeout(() => saveNotificationsToStorage(updatedNotifications), 0);
        return updatedNotifications;
      });
    }
  };

  // Auto-connect wallet on load
  useEffect(() => {
    const autoConnect = async () => {
      const { isConnected: wasConnected, savedAddress } = loadWalletConnection();

      if (wasConnected && savedAddress && window.ethereum) {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_accounts' });
          const currentAddr = accounts.length > 0 ? ethers.getAddress(accounts[0]) : null;

          if (currentAddr && currentAddr.toLowerCase() === savedAddress.toLowerCase()) {
            setConnectButtonText(BUTTON_STATES.CONNECTING);
            setConnectButtonDisabled(true);

            const newProvider = new ethers.BrowserProvider(window.ethereum);
            const newSigner = await newProvider.getSigner();

            setProvider(newProvider);
            setSigner(newSigner);
            setCurrentAccount(currentAddr);
            setIsConnected(true);

            // Reset button states after successful connection
            setConnectButtonText(BUTTON_STATES.CONNECT);
            setConnectButtonDisabled(false);
            setBridgeButtonText(BUTTON_STATES.BRIDGE);
            setBridgeButtonDisabled(false);

            console.log(`Auto-connected wallet: ${currentAddr}`);
          } else {
            clearWalletConnection();
          }
        } catch (error) {
          console.warn('Auto-connect failed:', error);
          clearWalletConnection();
          setConnectButtonText(BUTTON_STATES.CONNECT);
          setConnectButtonDisabled(false);
        }
      }
    };

    loadNotificationsFromStorage();
    autoConnect();
  }, [loadNotificationsFromStorage]);

  // Check current chain when wallet connects or from chain changes
  useEffect(() => {
    if (isConnected) {
      checkCurrentChain();
    }
  }, [isConnected, state.fromChain, checkCurrentChain]);

  // Update balance when account or chain changes
  useEffect(() => {
    updateBalance();
  }, [updateBalance]);

  // Start status polling when there are active notifications
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

  The code has been modified to include a desktop header with navigation and wallet connection, along with adjusted mobile view and navigation.  const unviewedCount = notifications.filter(n => !n.viewed).length;
  const fromConfig = CONTRACTS[state.fromChain];
  const toConfig = CONTRACTS[state.toChain];

  return (
    <div>
      <div className="background">
        <div className="orb"></div>
        <div className="orb"></div>
        <div className="orb"></div>
        <div className="orb"></div>
        <div className="orb"></div>
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
          <button 
            className={`header-wallet-button ${isConnected ? 'connected' : ''}`}
            onClick={connectWallet}
            disabled={connectButtonDisabled}
          >
            {isConnected ? (
              <div className="wallet-info">
                <div className="wallet-status">●</div>
                <span>{currentAccount ? `${currentAccount.slice(0, 6)}...${currentAccount.slice(-4)}` : 'Connected'}</span>
              </div>
            ) : (
              <div className="wallet-info">
                <svg viewBox="0 0 24 24">
                  <path d="M21 18v1c0 1.1-.9 2-2 2H5c-1.11 0-2-.9-2-2V5c0-1.1.89-2 2-2h14c1.1 0 2 .9 2 2v1h-9c-1.11 0-2 .9-2 2v8c0 1.1.89 2 2 2h9zm-9-2h10V8H12v8zm4-2.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
                </svg>
                {connectButtonText}
              </div>
            )}
          </button>
        </div>
      </div>

      <div className="container">
        <div className="bridge-card">
          <div className="header">
            <h1>Mon Bridge DEX</h1>
            <div className="subtitle">Cross Chain Bridge</div>
            <div className="subtitle" style={{marginTop: '4px', opacity: 0.7}}>Powered by LayerZero</div>

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

                      const getDetailedStatusText = (status) => {
                        switch (status) {
                          case 'DELIVERED':
                            return 'Transaction completed successfully';
                          case 'FAILED':
                            return 'Transaction failed';
                          case 'BLOCKED':
                            return 'Transaction blocked by network';
                          case 'INFLIGHT':
                            return 'Processing cross-chain transfer';
                          case 'CONFIRMING':
                            return 'Waiting for blockchain confirmation';
                          case 'PAYLOAD_STORED':
                            return 'Message stored, awaiting execution';
                          case 'APPLICATION_BURNED':
                            return 'Transaction reverted and burned';
                          case 'APPLICATION_SKIPPED':
                            return 'Transaction skipped due to conditions';
                          case 'UNRESOLVABLE_COMMAND':
                            return 'Command cannot be resolved';
                          case 'MALFORMED_COMMAND':
                            return 'Invalid transaction format';
                          default:
                            return 'Transaction processing';
                        }
                      };

                      const statusClass = getStatusClass(notification.status);
                      const statusText = getStatusText(notification.status);
                      const detailedStatus = getDetailedStatusText(notification.status);

                      const handleClick = notification.txHash && !notification.txHash.startsWith('no-tx-') && !notification.txHash.startsWith('chain-add-failed-') ? 
                        () => window.open(`https://testnet.layerzeroscan.com/tx/${notification.txHash}`, '_blank') : 
                        undefined;

                      return (
                        <div 
                          key={notification.id}
                          className="notification-item" 
                          onClick={handleClick}
                          style={handleClick ? {cursor: 'pointer'} : {}}
                          title={notification.errorMessage || detailedStatus}
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
                              {!notification.errorMessage && notification.status !== 'DELIVERED' && (
                                <div style={{fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: '2px', fontStyle: 'italic'}}>
                                  {detailedStatus}
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
                  <div className="to-amount">{amount || '0.0'}</div>
                </div>
              </div>

              <div className="future-notice">
                🚀 More tokens and chains coming soon! Stay tuned for updates.
              </div>

              <button 
                className="action-button bridge" 
                onClick={handleMainAction}
                disabled={bridgeButtonDisabled || connectButtonDisabled}
              >
                {isConnected ? bridgeButtonText : connectButtonText}
              </button>
            </div>
        </div>
      </div>
    </div>
  );
}

export default App;