import { ServiceConfig } from './types'

export function retryMiddleware(config: ServiceConfig) {
  return async (operation: () => Promise<any>) => {
    let lastError: Error = new Error('Operation failed after all retries')
    for (let i = 0; i < (config.maxRetries || 3); i++) {
      try {
        return await operation()
      } catch (err) {
        lastError = err as Error
        await new Promise(resolve => 
          setTimeout(resolve, config.retryDelay || 1000)
        )
      }
    }
    throw lastError
  }
}
