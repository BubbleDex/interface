import {
  BaseQueryFn,
  createApi,
  FetchArgs,
  fetchBaseQuery,
  FetchBaseQueryError,
  retry,
} from '@reduxjs/toolkit/query/react'
import { Protocol } from '@uniswap/router-sdk'
import { Token } from '@uniswap/sdk-core'
import qs from 'qs'

import { GetQuoteResult } from './types'

const protocols: Protocol[] = [Protocol.V2, Protocol.V3]

const DEFAULT_QUERY_PARAMS = {
  // forceCrossProtocol: 'true',
  // minSplits: '5',
  protocols: protocols.map((p) => p.toLowerCase()).join(','),
}

type SerializableToken = Pick<Token, 'address' | 'chainId' | 'symbol' | 'decimals'>

async function getClientSideQuote({
  tokenIn,
  tokenOut,
  amount,
  type,
}: {
  tokenIn: SerializableToken
  tokenOut: SerializableToken
  amount: string
  type: 'exactIn' | 'exactOut'
}) {
  return (await import('./localRouter')).getQuote(
    {
      type,
      chainId: tokenIn.chainId,
      tokenIn: { address: tokenIn.address, chainId: tokenIn.chainId, decimals: tokenIn.decimals },
      tokenOut: { address: tokenOut.address, chainId: tokenOut.chainId, decimals: tokenOut.decimals },
      amount,
    },
    { protocols }
  )
}

const baseQueryWithBailOut: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = retry(
  async (args: string | FetchArgs, api, extraOptions) => {
    const result = await fetchBaseQuery({
      baseUrl: 'https://api.uniswap.org/v1/',
    })(args, api, extraOptions)

    if (result.error) {
      retry.fail(result.error)
    }

    return result
  }
)

export const routingApi = createApi({
  reducerPath: 'routingApi',
  baseQuery: baseQueryWithBailOut,
  endpoints: (build) => ({
    getQuote: build.query<
      GetQuoteResult,
      {
        tokenIn: SerializableToken
        tokenOut: SerializableToken
        amount: string
        useClientSideRouter: boolean // included in key to invalidate on change
        type: 'exactIn' | 'exactOut'
      }
    >({
      async queryFn(args, _api, _extraOptions, fetch) {
        const { tokenIn, tokenOut, amount, useClientSideRouter, type } = args

        let result

        try {
          if (useClientSideRouter) {
            result = await getClientSideQuote(args)
          } else {
            const query = qs.stringify({
              ...DEFAULT_QUERY_PARAMS,
              tokenInAddress: tokenIn.address,
              tokenInChainId: tokenIn.chainId,
              tokenOutAddress: tokenOut.address,
              tokenOutChainId: tokenOut.chainId,
              amount,
              type,
            })
            result = await fetch(`quote?${query}`)
          }

          if (result.error) {
            throw result.error
          }

          return { data: result.data as GetQuoteResult }
        } catch (e) {
          return { error: e as FetchBaseQueryError }
        }
      },
    }),
  }),
})

export const { useGetQuoteQuery } = routingApi
