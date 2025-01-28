import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    // Only return necessary configuration
    const config = {
      privateKey: process.env.SOLANA_PRIVATE_KEY,
      network: process.env.NEXT_PUBLIC_NETWORK || 'mainnet',
    };

    return res.status(200).json(config);
  } catch (error) {
    console.error('Config API error:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
}
