import { db } from '@/utils/db/dexie/db'
import { aiTranslate, googleTranslate, microsoftTranslate } from '@/utils/host/translate/api'
import { RequestQueue } from '@/utils/request/request-queue'

export function setUpRequestQueue() {
  const requestQueue = new RequestQueue({
    rate: 5,
    capacity: 300,
    timeoutMs: 20_000,
    maxRetries: 2,
    baseRetryDelayMs: 1_000,
  })

  onMessage('enqueueRequest', async (message) => {
    const { data } = message

    // Check cache first
    if (data.hash) {
      const cached = await db.translationCache.get(data.hash)
      if (cached) {
        return cached.translation
      }
    }

    // Create thunk based on type and params
    let thunk: () => Promise<any>
    switch (data.type) {
      case 'googleTranslate':
        thunk = () => googleTranslate(data.params.text, data.params.fromLang, data.params.toLang)
        break
      case 'microsoftTranslate':
        thunk = () => microsoftTranslate(data.params.text, data.params.fromLang, data.params.toLang)
        break
      case 'aiTranslate':
        thunk = () => aiTranslate(data.params.provider, data.params.modelString, data.params.prompt)
        break
      default:
        throw new Error(`Unknown request type: ${data.type}`)
    }

    const result = await requestQueue.enqueue(thunk, data.scheduleAt, data.hash)

    // Cache the translation result if successful
    if (result && data.hash) {
      await db.translationCache.put({
        key: data.hash,
        translation: result,
        createdAt: new Date(),
      })
    }

    return result
  })
}
