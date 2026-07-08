import PostalMime from 'postal-mime'

export default {
  async email(message, env, ctx) {
    // 사람이 보는 받은편지함으로도 항상 전달 (자동 처리 실패 시 안전망)
    ctx.waitUntil(message.forward(env.FORWARD_TO))

    try {
      const raw = await streamToUint8Array(message.raw, message.rawSize)
      const parsed = await PostalMime.parse(raw)

      const subject = parsed.subject || ''
      const match = subject.match(/PO-\d{6}-\d{2}/)
      if (!match) return // 발주번호가 없는 메일(일반 문의 등)은 자동 처리 대상 아님

      const attachment = (parsed.attachments || [])[0]

      const payload = {
        order_number: match[0],
        text: parsed.text || '',
        attachment: attachment
          ? {
              filename: attachment.filename || 'attachment',
              contentType: attachment.mimeType || 'application/octet-stream',
              contentBase64: uint8ArrayToBase64(attachment.content)
            }
          : null
      }

      const res = await fetch(env.WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': env.WEBHOOK_SECRET
        },
        body: JSON.stringify(payload)
      })

      if (!res.ok) {
        console.error('웹훅 처리 실패:', res.status, await res.text())
      }
    } catch (err) {
      console.error('발주확인서 이메일 파싱 실패:', err)
    }
  }
}

async function streamToUint8Array(stream, size) {
  const reader = stream.getReader()
  const buffer = new Uint8Array(size)
  let offset = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer.set(value, offset)
    offset += value.length
  }
  return buffer
}

function uint8ArrayToBase64(bytes) {
  let binary = ''
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  for (let i = 0; i < arr.byteLength; i++) binary += String.fromCharCode(arr[i])
  return btoa(binary)
}
