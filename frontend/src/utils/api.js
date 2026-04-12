import axios from 'axios'

const api = axios.create({ baseURL: '/api', timeout: 60000 })

export const uploadFile = (file, onProgress) => {
  const form = new FormData()
  form.append('file', file)
  return api.post('/upload', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    onUploadProgress: e => onProgress?.(Math.round((e.loaded * 100) / e.total)),
  })
}

export const getData = (sessionId, page = 1, pageSize = 100) =>
  api.get(`/data/${sessionId}`, { params: { page, page_size: pageSize } })

export const getChartData = (sessionId, params) =>
  api.get(`/chart/${sessionId}`, { params })

export const cleanData = (sessionId, operations) =>
  api.post('/clean', { session_id: sessionId, operations })

export const exportCsvUrl = sessionId => `/api/export/${sessionId}`

// Generic SSE streaming helper
async function streamSSE(url, body, onChunk, onDone) {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }))
      onChunk?.(`**Error ${res.status}:** ${err.detail || 'Unknown error'}`)
      onDone?.()
      return
    }
    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop()
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const data = line.slice(6).trim()
        if (data === '[DONE]') { onDone?.(); return }
        try { onChunk?.(JSON.parse(data).text) } catch (_) {}
      }
    }
  } catch (e) {
    onChunk?.(`**Network error:** ${e.message}`)
  }
  onDone?.()
}

export const streamChat = (sessionId, message, history, onChunk, onDone) =>
  streamSSE('/api/chat', { session_id: sessionId, message, history }, onChunk, onDone)

export const streamQuickAnalysis = (sessionId, analysisType, onChunk, onDone) =>
  streamSSE('/api/quick-analysis', { session_id: sessionId, analysis_type: analysisType }, onChunk, onDone)
