import { useEffect, useMemo, useState } from 'react';
import { Contract, ethers } from 'ethers';
import { useAccount, useReadContract } from 'wagmi';
import { isAddress } from 'viem';

import { CONTRACT_ABI, CONTRACT_ADDRESS } from '../config/contracts';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { useEthersSigner } from '../hooks/useEthersSigner';
import { Header } from './Header';
import '../styles/OracleApp.css';

const ASSETS = [
  { id: 0, symbol: 'ETH', name: 'Ethereum' },
  { id: 1, symbol: 'BTC', name: 'Bitcoin' },
] as const;

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const directionOptions = [
  { value: '1', label: 'Greater than' },
  { value: '2', label: 'Less than' },
] as const;

function isNumeric(value: string) {
  return /^[0-9]+$/.test(value);
}

export function OracleApp() {
  const { address } = useAccount();
  const { instance, isLoading: isZamaLoading, error: zamaError } = useZamaInstance();
  const signerPromise = useEthersSigner();

  const [contractAddressInput, setContractAddressInput] = useState(CONTRACT_ADDRESS);
  const resolvedAddress = useMemo(
    () => {
      if (!isAddress(contractAddressInput)) {
        return undefined;
      }
      if (contractAddressInput.toLowerCase() === ZERO_ADDRESS) {
        return undefined;
      }
      return contractAddressInput as `0x${string}`;
    },
    [contractAddressInput],
  );
  const safeAddress = (resolvedAddress ?? CONTRACT_ADDRESS) as `0x${string}`;

  const [selectedAsset, setSelectedAsset] = useState<number>(0);
  const [predictionPrice, setPredictionPrice] = useState('');
  const [predictionDirection, setPredictionDirection] = useState('1');
  const [stakeAmount, setStakeAmount] = useState('0.02');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState('');

  const [confirmAsset, setConfirmAsset] = useState<number>(0);
  const [confirmDay, setConfirmDay] = useState('');
  const [isConfirming, setIsConfirming] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState('');

  const [adminAsset, setAdminAsset] = useState<number>(0);
  const [adminPrice, setAdminPrice] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordStatus, setRecordStatus] = useState('');

  const [isDecrypting, setIsDecrypting] = useState(false);
  const [decryptedPoints, setDecryptedPoints] = useState<string | null>(null);
  const [decryptStatus, setDecryptStatus] = useState('');

  const { data: ownerData } = useReadContract({
    address: safeAddress,
    abi: CONTRACT_ABI,
    functionName: 'owner',
    query: { enabled: !!resolvedAddress },
  });

  const { data: currentDayData } = useReadContract({
    address: safeAddress,
    abi: CONTRACT_ABI,
    functionName: 'currentDay',
    query: { enabled: !!resolvedAddress },
  });

  const { data: ethLatestDay } = useReadContract({
    address: safeAddress,
    abi: CONTRACT_ABI,
    functionName: 'getLatestDay',
    args: [0],
    query: { enabled: !!resolvedAddress },
  });

  const { data: btcLatestDay } = useReadContract({
    address: safeAddress,
    abi: CONTRACT_ABI,
    functionName: 'getLatestDay',
    args: [1],
    query: { enabled: !!resolvedAddress },
  });

  const currentDay = currentDayData as bigint | undefined;
  const ethLatestDayValue = ethLatestDay as bigint | undefined;
  const btcLatestDayValue = btcLatestDay as bigint | undefined;

  const { data: ethPriceData } = useReadContract({
    address: safeAddress,
    abi: CONTRACT_ABI,
    functionName: 'getPrice',
    args: [0, (ethLatestDayValue ?? 0n) as bigint],
    query: { enabled: !!resolvedAddress && ethLatestDayValue !== undefined },
  });

  const { data: btcPriceData } = useReadContract({
    address: safeAddress,
    abi: CONTRACT_ABI,
    functionName: 'getPrice',
    args: [1, (btcLatestDayValue ?? 0n) as bigint],
    query: { enabled: !!resolvedAddress && btcLatestDayValue !== undefined },
  });

  const { data: pointsHandle } = useReadContract({
    address: safeAddress,
    abi: CONTRACT_ABI,
    functionName: 'getPoints',
    args: address ? [address] : undefined,
    query: { enabled: !!resolvedAddress && !!address },
  });

  const confirmDayValue = useMemo(() => {
    if (!isNumeric(confirmDay)) {
      return undefined;
    }
    return BigInt(confirmDay);
  }, [confirmDay]);

  const { data: predictionData } = useReadContract({
    address: safeAddress,
    abi: CONTRACT_ABI,
    functionName: 'getPrediction',
    args: address && confirmDayValue !== undefined ? [address, confirmAsset, confirmDayValue] : undefined,
    query: { enabled: !!resolvedAddress && !!address && confirmDayValue !== undefined },
  });

  useEffect(() => {
    const fallback = currentDay !== undefined ? currentDay + 1n : undefined;
    if (confirmDay === '' && fallback !== undefined) {
      setConfirmDay(fallback.toString());
    }
  }, [currentDay, confirmDay]);

  useEffect(() => {
    const latestDay = confirmAsset === 0 ? ethLatestDayValue : btcLatestDayValue;
    if (latestDay !== undefined) {
      setConfirmDay(latestDay.toString());
    }
  }, [confirmAsset, ethLatestDayValue, btcLatestDayValue]);

  const predictionDay = currentDay !== undefined ? currentDay + 1n : undefined;
  const ownerAddress = ownerData as string | undefined;
  const isOwner = ownerAddress && address ? ownerAddress.toLowerCase() === address.toLowerCase() : false;

  const handlePlacePrediction = async () => {
    setSubmitStatus('');
    if (!resolvedAddress) {
      setSubmitStatus('Invalid contract address.');
      return;
    }
    if (!instance || !address || !signerPromise) {
      setSubmitStatus('Connect your wallet and initialize encryption.');
      return;
    }
    if (!isNumeric(predictionPrice) || !isNumeric(predictionDirection)) {
      setSubmitStatus('Enter a valid integer price and direction.');
      return;
    }

    setIsSubmitting(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const priceValue = BigInt(predictionPrice);
      const directionValue = BigInt(predictionDirection);
      const stakeValue = ethers.parseEther(stakeAmount);

      const input = instance.createEncryptedInput(resolvedAddress, address);
      input.add64(priceValue);
      input.add8(directionValue);
      const encryptedInput = await input.encrypt();

      const contract = new Contract(resolvedAddress, CONTRACT_ABI, signer);
      const tx = await contract.placePrediction(
        selectedAsset,
        encryptedInput.handles[0],
        encryptedInput.handles[1],
        encryptedInput.inputProof,
        { value: stakeValue },
      );

      setSubmitStatus('Transaction sent. Waiting for confirmation...');
      await tx.wait();
      setSubmitStatus('Prediction submitted successfully.');
      setPredictionPrice('');
    } catch (error) {
      console.error(error);
      setSubmitStatus(`Submission failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPrediction = async () => {
    setConfirmStatus('');
    if (!resolvedAddress) {
      setConfirmStatus('Invalid contract address.');
      return;
    }
    if (!signerPromise) {
      setConfirmStatus('Connect your wallet first.');
      return;
    }
    if (confirmDayValue === undefined) {
      setConfirmStatus('Provide a valid day value.');
      return;
    }

    setIsConfirming(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const contract = new Contract(resolvedAddress, CONTRACT_ABI, signer);
      const tx = await contract.confirmPrediction(confirmAsset, confirmDayValue);
      setConfirmStatus('Confirmation sent. Waiting for finality...');
      await tx.wait();
      setConfirmStatus('Confirmation completed. Check your points.');
    } catch (error) {
      console.error(error);
      setConfirmStatus(`Confirmation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDecryptPoints = async () => {
    setDecryptStatus('');
    if (!resolvedAddress) {
      setDecryptStatus('Invalid contract address.');
      return;
    }
    if (!instance || !address || !hasPointsHandle || !signerPromise) {
      setDecryptStatus('Connect your wallet to decrypt points.');
      return;
    }

    setIsDecrypting(true);
    try {
      const keypair = instance.generateKeypair();
      const handleContractPairs = [
        {
          handle: pointsHandleValue,
          contractAddress: resolvedAddress,
        },
      ];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '5';
      const contractAddresses = [resolvedAddress];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        address,
        startTimeStamp,
        durationDays,
      );

      const decrypted = result[pointsHandleValue as string];
      setDecryptedPoints(decrypted?.toString() ?? null);
      setDecryptStatus('Decryption complete.');
    } catch (error) {
      console.error(error);
      setDecryptStatus(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsDecrypting(false);
    }
  };

  const handleRecordPrice = async () => {
    setRecordStatus('');
    if (!resolvedAddress) {
      setRecordStatus('Invalid contract address.');
      return;
    }
    if (!signerPromise) {
      setRecordStatus('Connect your wallet first.');
      return;
    }
    if (!isNumeric(adminPrice)) {
      setRecordStatus('Enter a valid integer price.');
      return;
    }

    setIsRecording(true);
    try {
      const signer = await signerPromise;
      if (!signer) {
        throw new Error('Signer unavailable');
      }

      const contract = new Contract(resolvedAddress, CONTRACT_ABI, signer);
      const tx = await contract.recordDailyPrice(adminAsset, BigInt(adminPrice));
      setRecordStatus('Recording price...');
      await tx.wait();
      setRecordStatus('Price recorded successfully.');
      setAdminPrice('');
    } catch (error) {
      console.error(error);
      setRecordStatus(`Recording failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsRecording(false);
    }
  };

  const [ethPrice, ethRecorded] = (ethPriceData ?? []) as [bigint, boolean];
  const [btcPrice, btcRecorded] = (btcPriceData ?? []) as [bigint, boolean];
  const predictionExists = predictionData ? (predictionData[4] as boolean) : false;
  const predictionConfirmed = predictionData ? (predictionData[3] as boolean) : false;
  const predictionStake = predictionData ? (predictionData[2] as bigint) : undefined;
  const predictionPriceHandle = predictionData ? (predictionData[0] as string) : undefined;
  const predictionDirectionHandle = predictionData ? (predictionData[1] as string) : undefined;
  const pointsHandleValue = typeof pointsHandle === 'string' ? pointsHandle : undefined;
  const hasPointsHandle = pointsHandleValue ? pointsHandleValue !== ethers.ZeroHash : false;

  return (
    <div className="oracle-page">
      <Header />

      <section className="overview-panel">
        <div className="panel-head">
          <h2>Network Overview</h2>
          <p>UTC day index anchors the daily price update cycle.</p>
        </div>
        <div className="overview-grid">
          <div className="stat-card">
            <p className="stat-label">Current UTC Day</p>
            <p className="stat-value">{currentDay?.toString() ?? '--'}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Next Prediction Day</p>
            <p className="stat-value">{predictionDay?.toString() ?? '--'}</p>
          </div>
          <div className="stat-card">
            <p className="stat-label">Relayer Status</p>
            <p className="stat-value">{isZamaLoading ? 'Loading' : zamaError ? 'Unavailable' : 'Ready'}</p>
          </div>
        </div>
      </section>

      <section className="panel contract-panel">
        <div>
          <h3>Contract Address</h3>
          <p>Use the deployed Sepolia address. Invalid inputs disable reads.</p>
        </div>
        <div className="contract-input">
          <input
            type="text"
            value={contractAddressInput}
            onChange={(event) => setContractAddressInput(event.target.value.trim())}
            placeholder="0x..."
          />
          <span className={`address-indicator ${resolvedAddress ? 'ok' : 'bad'}`}>
            {resolvedAddress ? 'Valid' : 'Invalid'}
          </span>
        </div>
      </section>

      <section className="panel price-panel">
        <div className="panel-head">
          <h3>Daily Price Ledger</h3>
          <p>Recorded at UTC 00:00 by the oracle operator.</p>
        </div>
        <div className="price-grid">
          <div className="price-card">
            <div className="price-heading">
              <span>{ASSETS[0].symbol}</span>
              <span className="price-day">Day {ethLatestDayValue?.toString() ?? '--'}</span>
            </div>
            <p className="price-value">{ethRecorded ? ethPrice?.toString() : 'Pending'}</p>
            <p className="price-note">{ethRecorded ? 'Price recorded' : 'Waiting for update'}</p>
          </div>
          <div className="price-card">
            <div className="price-heading">
              <span>{ASSETS[1].symbol}</span>
              <span className="price-day">Day {btcLatestDayValue?.toString() ?? '--'}</span>
            </div>
            <p className="price-value">{btcRecorded ? btcPrice?.toString() : 'Pending'}</p>
            <p className="price-note">{btcRecorded ? 'Price recorded' : 'Waiting for update'}</p>
          </div>
        </div>
      </section>

      <section className="panel prediction-panel">
        <div className="panel-head">
          <h3>Place Prediction</h3>
          <p>Encrypt your predicted price and direction. Stakes are in ETH.</p>
        </div>
        <div className="form-grid">
          <label>
            Asset
            <select value={selectedAsset} onChange={(event) => setSelectedAsset(Number(event.target.value))}>
              {ASSETS.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol} - {asset.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Predicted Price (integer)
            <input
              type="text"
              value={predictionPrice}
              onChange={(event) => setPredictionPrice(event.target.value)}
              placeholder="e.g. 1920"
            />
          </label>
          <label>
            Direction
            <select value={predictionDirection} onChange={(event) => setPredictionDirection(event.target.value)}>
              {directionOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Stake (ETH)
            <input
              type="text"
              value={stakeAmount}
              onChange={(event) => setStakeAmount(event.target.value)}
              placeholder="0.02"
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            className="primary-button"
            onClick={handlePlacePrediction}
            disabled={isSubmitting || !address}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Prediction'}
          </button>
          <p className="form-status">{submitStatus}</p>
        </div>
      </section>

      <section className="panel confirmation-panel">
        <div className="panel-head">
          <h3>Confirm & Verify</h3>
          <p>Confirm tomorrow to unlock encrypted points if your direction is correct.</p>
        </div>
        <div className="form-grid">
          <label>
            Asset
            <select value={confirmAsset} onChange={(event) => setConfirmAsset(Number(event.target.value))}>
              {ASSETS.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol}
                </option>
              ))}
            </select>
          </label>
          <label>
            Day to Confirm (UTC index)
            <input
              type="text"
              value={confirmDay}
              onChange={(event) => setConfirmDay(event.target.value)}
            />
          </label>
          <div className="prediction-preview">
            <p className="preview-title">Prediction Snapshot</p>
            <p>{predictionExists ? 'Stored' : 'Missing'}</p>
            <p>{predictionConfirmed ? 'Already confirmed' : 'Not confirmed'}</p>
            <p>Stake: {predictionStake !== undefined ? ethers.formatEther(predictionStake) : '--'} ETH</p>
          </div>
          <div className="prediction-preview">
            <p className="preview-title">Encrypted Handles</p>
            <p>{predictionPriceHandle ? `${predictionPriceHandle.slice(0, 10)}...` : '--'}</p>
            <p>{predictionDirectionHandle ? `${predictionDirectionHandle.slice(0, 10)}...` : '--'}</p>
          </div>
        </div>
        <div className="form-actions">
          <button
            className="primary-button"
            onClick={handleConfirmPrediction}
            disabled={isConfirming || !address}
          >
            {isConfirming ? 'Confirming...' : 'Confirm Prediction'}
          </button>
          <p className="form-status">{confirmStatus}</p>
        </div>
      </section>

      <section className="panel points-panel">
        <div className="panel-head">
          <h3>Your Encrypted Points</h3>
          <p>Points are encrypted on-chain. Decrypt with your wallet.</p>
        </div>
        <div className="points-grid">
          <div>
            <p className="points-label">Encrypted Handle</p>
            <p className="points-handle">
              {hasPointsHandle && pointsHandleValue ? `${pointsHandleValue.slice(0, 14)}...` : 'No handle yet'}
            </p>
          </div>
          <div>
            <p className="points-label">Decrypted Points</p>
            <p className="points-value">{decryptedPoints ?? '***'}</p>
          </div>
        </div>
        <div className="form-actions">
          <button
            className="secondary-button"
            onClick={handleDecryptPoints}
            disabled={isDecrypting || !address || !hasPointsHandle}
          >
            {isDecrypting ? 'Decrypting...' : 'Decrypt Points'}
          </button>
          <p className="form-status">{decryptStatus}</p>
        </div>
      </section>

      <section className={`panel admin-panel ${isOwner ? '' : 'disabled-panel'}`}>
        <div className="panel-head">
          <h3>Oracle Operator</h3>
          <p>Record the daily price at UTC 00:00. Visible to the owner only.</p>
        </div>
        <div className="form-grid">
          <label>
            Asset
            <select value={adminAsset} onChange={(event) => setAdminAsset(Number(event.target.value))}>
              {ASSETS.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.symbol}
                </option>
              ))}
            </select>
          </label>
          <label>
            Price (integer)
            <input
              type="text"
              value={adminPrice}
              onChange={(event) => setAdminPrice(event.target.value)}
              placeholder="e.g. 2015"
            />
          </label>
          <div className="admin-meta">
            <p className="points-label">Owner</p>
            <p className="points-handle">{ownerAddress ?? '--'}</p>
          </div>
        </div>
        <div className="form-actions">
          <button
            className="primary-button"
            onClick={handleRecordPrice}
            disabled={isRecording || !isOwner}
          >
            {isRecording ? 'Recording...' : 'Record Daily Price'}
          </button>
          <p className="form-status">{isOwner ? recordStatus : 'Connect the owner wallet to enable.'}</p>
        </div>
      </section>
    </div>
  );
}
