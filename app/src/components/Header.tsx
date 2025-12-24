import { ConnectButton } from '@rainbow-me/rainbowkit';
import '../styles/Header.css';

export function Header() {
  return (
    <header className="site-header">
      <div className="header-content">
        <div className="brand-block">
          <div className="brand-mark">PO</div>
          <div>
            <p className="brand-kicker">PrivOracle</p>
            <h1 className="brand-title">Encrypted Daily Price Arena</h1>
            <p className="brand-subtitle">Predict ETH or BTC with FHE. Confirm tomorrow. Earn encrypted points.</p>
          </div>
        </div>
        <div className="wallet-box">
          <ConnectButton showBalance={false} />
        </div>
      </div>
    </header>
  );
}
