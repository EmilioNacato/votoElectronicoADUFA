const fs = require('fs');
const path = require('path');
const { Wallets } = require('fabric-network');

async function main() {
  try {
    const walletPath = path.join(__dirname, 'Wallet_votoElectronicoBD');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    const certPath = '/home/ubuntu/fabric-network/crypto-config/artifacts/crypto/peerOrganizations/VotoBlockchain/users/bmogrovejog@hotmail.com/msp/signcerts/VotoBlockchain-signcert.pem';
    const keyPath = '/home/ubuntu/fabric-network/crypto-config/artifacts/crypto/peerOrganizations/VotoBlockchain/users/bmogrovejog@hotmail.com/msp/keystore/VotoBlockchain-key.pem';

    const cert = fs.readFileSync(certPath).toString();
    const key = fs.readFileSync(keyPath).toString();

    const identityLabel = 'bmogrovejog@hotmail.com';
    const identity = {
      credentials: {
        certificate: cert,
        privateKey: key,
      },
      mspId: 'VotoBlockchain',
      type: 'X.509',
    };

    await wallet.put(identityLabel, identity);
    console.log(`Successfully imported identity: ${identityLabel}`);
  } catch (error) {
    console.error(`Failed to import identity: ${error}`);
    process.exit(1);
  }
}

main();
