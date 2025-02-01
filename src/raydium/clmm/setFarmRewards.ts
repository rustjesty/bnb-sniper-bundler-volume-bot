import { ApiV3PoolInfoConcentratedItem, ClmmKeys, RAYMint, isDecimal } from '@raydium-io/raydium-sdk-v2'
import JSBI from 'jsbi'
import { initSdk, txVersion } from '../config'
import { isValidClmm } from './utils'

export const setFarmRewards = async () => {
  const raydium = await initSdk()

  let poolInfo: ApiV3PoolInfoConcentratedItem
  const poolId = '2QdhepnKRTLjjSqPL1PtKNwqrUkoLee5Gqs8bvZhRdMv'
  let poolKeys: ClmmKeys | undefined

  if (raydium.cluster === 'mainnet') {
    const data = await raydium.api.fetchPoolById({ ids: poolId })
    poolInfo = data[0] as ApiV3PoolInfoConcentratedItem
    if (!isValidClmm(poolInfo.programId)) throw new Error('target pool is not CLMM pool')
  } else {
    const data = await raydium.clmm.getPoolInfoFromRpc(poolId)
    poolInfo = data.poolInfo
    poolKeys = data.poolKeys
  }

  const mint = await raydium.token.getTokenInfo(RAYMint.toBase58())
  const currentChainTime = await raydium.currentBlockChainTime()
  const openTime = Math.floor(currentChainTime / 1000)
  const endTime = openTime + 60 * 60 * 24 * 7

  const editRewardInfos = [{
    mint,
    openTime,
    endTime,
    perSecond: Object.create(isDecimal.prototype, {
      d: { value: JSBI.add(JSBI.BigInt(0), JSBI.BigInt(1)) },
      e: { value: 0 },
      s: { value: 1 }
    })
  }]

  const setRewardBuildData = await raydium.clmm.setRewards({
    poolInfo,
    poolKeys,
    rewardInfos: editRewardInfos,
    checkCreateATAOwner: true,
    ownerInfo: {
      useSOLBalance: true,
    },
    txVersion,
  })

  const { txId } = await setRewardBuildData.execute({ sendAndConfirm: true })
  console.log('clmm farm created:', { txId: `https://explorer.solana.com/tx/${txId}` })
}