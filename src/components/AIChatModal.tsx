import { useState, useRef, useEffect } from 'react'
import { api } from '../services/api'
import { SelectedFloat } from '../types'
import { useCesium } from '../cesium/CesiumContext'

interface AIChatModalProps {
  isOpen: boolean
  onClose: () => void
  selectedFloat?: SelectedFloat | null
}

interface Message {
  role: 'user' | 'assistant'
  content: string
}

export default function AIChatModal({ isOpen, onClose, selectedFloat }: AIChatModalProps) {
  const { dispatchAction, setDepth, setVariable } = useCesium()
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content:
        '👋 Hi! I am **Astra Ocean AI** (powered by GPT-6 Astra). Ask me about ocean temperature profiles, thermocline behavior, salinity, model bias, or ask me to navigate the 3D globe (e.g. *"Show temperature bias near the Arabian Sea at 200 metres"*).',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, loading])

  if (!isOpen) return null

  const parseAndExecuteActions = (text: string) => {
    const lower = text.toLowerCase()
    // 1. Region detection
    if (lower.includes('arabian sea')) {
      dispatchAction({ action: 'SET_REGION', payload: { region_id: 'arabian_sea' } })
    } else if (lower.includes('bay of bengal')) {
      dispatchAction({ action: 'SET_REGION', payload: { region_id: 'bay_of_bengal' } })
    } else if (lower.includes('somali')) {
      dispatchAction({ action: 'SET_REGION', payload: { region_id: 'somali_basin' } })
    } else if (lower.includes('andaman')) {
      dispatchAction({ action: 'SET_REGION', payload: { region_id: 'andaman_sea' } })
    }

    // 2. Depth detection (e.g. "200 m", "200m", "500 metres", "surface")
    const depthMatch = lower.match(/(\d+)\s*(m|metres|meters|dbar)/)
    if (depthMatch && depthMatch[1]) {
      setDepth(Number(depthMatch[1]))
    } else if (lower.includes('surface')) {
      setDepth(0)
    }

    // 3. Variable detection
    if (lower.includes('salinity') || lower.includes('salt')) {
      setVariable('salinity')
    } else if (lower.includes('temperature') || lower.includes('thermal') || lower.includes('temp')) {
      setVariable('temperature')
    } else if (lower.includes('current')) {
      setVariable('current_speed')
    }

    // 4. Layer triggers (e.g. "show error map", "show bias", "show bathymetry")
    if (lower.includes('bias') || lower.includes('error map') || lower.includes('anomaly')) {
      dispatchAction({ action: 'SHOW_ERROR_MAP' })
    }
  }

  const handleSend = async () => {
    if (!input.trim() || loading) return

    const userPrompt = input.trim()
    const userMsg: Message = { role: 'user', content: userPrompt }
    const updatedMessages = [...messages, userMsg]
    setMessages(updatedMessages)
    setInput('')
    setLoading(true)

    // Execute any immediate interactive client actions
    parseAndExecuteActions(userPrompt)

    // Construct context string
    let contextStr = 'Platform: INCOIS Ocean Digital Twin (SIH 2026 - Cesium WGS84 3D)'
    if (selectedFloat) {
      contextStr += `\nCurrently Selected Float: Platform #${selectedFloat.platform_number}, Cycle #${selectedFloat.cycle_number} at Lat ${selectedFloat.latitude.toFixed(2)}°, Lon ${selectedFloat.longitude.toFixed(2)}°, Time: ${selectedFloat.time}`
    }

    try {
      const res = await api.aiChat(
        updatedMessages.map(m => ({ role: m.role, content: m.content })),
        contextStr
      )
      setMessages([...updatedMessages, { role: 'assistant', content: res.reply }])
      parseAndExecuteActions(res.reply)
    } catch (err: any) {
      setMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content: `⚠️ **Error communicating with GPT-6 Astra:** ${err.message || 'Server error'}`,
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '80px',
        right: '24px',
        width: '420px',
        height: '560px',
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        backdropFilter: 'blur(16px)',
        border: '1px solid rgba(56, 189, 248, 0.3)',
        borderRadius: '16px',
        boxShadow: '0 20px 50px rgba(0,0,0,0.6)',
        display: 'flex',
        flexDirection: 'column',
        zIndex: 2000,
        overflow: 'hidden',
        color: '#f8fafc',
        fontFamily: 'system-ui, -apple-system, sans-serif',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '14px 18px',
          background: 'linear-gradient(135deg, rgba(14, 165, 233, 0.2), rgba(99, 102, 241, 0.2))',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '10px',
              height: '10px',
              borderRadius: '50%',
              backgroundColor: '#10b981',
              boxShadow: '0 0 10px #10b981',
            }}
          />
          <div>
            <div style={{ fontWeight: 600, fontSize: '15px', color: '#38bdf8' }}>
              GPT-6 Astra Intelligence
            </div>
            <div style={{ fontSize: '11px', color: '#94a3b8' }}>
              INCOIS Ocean Assistant • Cesium 3D Navigator
            </div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            fontSize: '20px',
            cursor: 'pointer',
            padding: '4px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Message List */}
      <div
        style={{
          flex: 1,
          padding: '16px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {messages.map((m, idx) => (
          <div
            key={idx}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              backgroundColor: m.role === 'user' ? '#0284c7' : 'rgba(30, 41, 59, 0.9)',
              color: '#f8fafc',
              padding: '10px 14px',
              borderRadius: m.role === 'user' ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
              fontSize: '13px',
              lineHeight: '1.5',
              whiteSpace: 'pre-wrap',
              border: m.role === 'assistant' ? '1px solid rgba(255,255,255,0.08)' : 'none',
            }}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div
            style={{
              alignSelf: 'flex-start',
              backgroundColor: 'rgba(30, 41, 59, 0.9)',
              color: '#38bdf8',
              padding: '10px 14px',
              borderRadius: '16px 16px 16px 2px',
              fontSize: '13px',
              fontStyle: 'italic',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <span>✨ GPT-6 Astra analyzing...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Form */}
      <div
        style={{
          padding: '12px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          display: 'flex',
          gap: '8px',
        }}
      >
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Ask or command: 'Show Arabian Sea bias at 200m'..."
          disabled={loading}
          style={{
            flex: 1,
            backgroundColor: 'rgba(30, 41, 59, 0.8)',
            border: '1px solid rgba(255,255,255,0.15)',
            borderRadius: '8px',
            padding: '10px 12px',
            color: '#fff',
            fontSize: '13px',
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            backgroundColor: '#0284c7',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            padding: '0 16px',
            fontWeight: 600,
            cursor: loading || !input.trim() ? 'not-allowed' : 'pointer',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
