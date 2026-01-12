import React from 'react';
import { TonConnectButton } from '@tonconnect/ui-react';

export default function Navbar() {
  // UI FIX: always render a single TonConnectButton here.
  // Detailed connection state (address, balances) is handled elsewhere.
  return (
    <div className="flex items-center">
      <TonConnectButton />
    </div>
  );
}
