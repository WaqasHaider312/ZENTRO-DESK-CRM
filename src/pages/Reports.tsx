import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'
import {
  BarChart2, Loader2, TrendingUp, Clock, CheckCircle,
  MessageCircle, Users, Zap, Phone, Facebook, Instagram, Globe, Mail
} from 'lucide-react'
import { subDays, startOfDay, format } from 'date-fns'

// ── Types ────────────────────────────────────────────────────────────────

type Period = '1d' | '7d' | '30d'

interface SummaryStats {
  total: number
  open: number
  in_progress: number
  pending: number
  resolved: number
  resolvedToday: number
  aiHandled: number
  avgFirstResponseMin: number | null
  avgResolutionMin: number | null
}

interface AgentRow {
  id: string
  name: string
  resolved: number
  resolvedToday: number
  avgResponseMin: number | null
}

interface ChannelRow {
  channel: string
  count: number
  resolved: number
}

interface DayBar {
  label: string
  created: number
  resolved: number
}

interface HourBar {
  hour: string
  created: number
  resolved: number
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatDur(minutes: number): string {
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const CHANNEL_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  whatsapp: Phone,
  facebook: Facebook,
  instagram: Instagram,
  widget: Globe,
  email: Mail,
}

const CHANNEL_COLORS: Record<string, string> = {
  whatsapp: 'text-green-600 bg-green-50',
  facebook: 'text-blue-600 bg-blue-50',
  instagram: 'text-pink-600 bg-pink-50',
  widget: 'text-violet-600 bg-violet-50',
  email: 'text-orange-600 bg-orange-50',
}

const CHANNEL_LABELS: Record<string, string> = {
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  instagram: 'Instagram',
  widget: 'Web Widget',
  email: 'Email',
}

// ── Stat Card ────────────────────────────────────────────────────────────

function StatCard({
  label, value, sub, color, icon: Icon
}: {
  label: string
  value: string | number
  sub?: string
  color: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-start gap-4">
      <div className={cn('w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0', color)}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-gray-500 font-medium mb-0.5">{label}</p>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}

// ── Bar Chart (pure CSS) ─────────────────────────────────────────────────

function BarChart({
  data,
  bars,
}: {
  data: Array<Record<string, any> & { label: string }>
  bars: Array<{ key: string; color: string; label: string }>
}) {
  const maxVal = Math.max(...data.flatMap(d => bars.map(b => d[b.key] || 0)), 1)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-end gap-1.5 flex-1 pb-6 relative">
        {/* Y-axis guide lines */}
        <div className="absolute inset-0 flex flex-col justify-between pointer-events-none pb-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="border-t border-gray-100 w-full" />
          ))}
        </div>

        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 relative z-10">
            <div className="w-full flex items-end justify-center gap-0.5" style={{ height: '160px' }}>
              {bars.map(bar => {
                const val = d[bar.key] || 0
                const pct = maxVal > 0 ? (val / maxVal) * 100 : 0
                return (
                  <div
                    key={bar.key}
                    className="group relative flex-1 rounded-t cursor-default"
                    style={{
                      height: `${Math.max(pct, val > 0 ? 4 : 0)}%`,
                      backgroundColor: bar.color,
                    }}
                  >
                    {val > 0 && (
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {val}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
            <span className="text-[10px] text-gray-400 truncate max-w-full px-0.5">{d.label}</span>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-5 pt-1 border-t border-gray-100">
        {bars.map(bar => (
          <div key={bar.key} className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: bar.color }} />
            <span className="text-xs text-gray-500">{bar.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────

export default function Reports() {
  const { organization, profile } = useAuth()
  const [period, setPeriod] = useState<Period>('7d')
  const [loading, setLoading] = useState(true)
  const [summary, setSummary] = useState<SummaryStats | null>(null)
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [channels, setChannels] = useState<ChannelRow[]>([])
  const [volumeTrend, setVolumeTrend] = useState<DayBar[]>([])
  const [hourlyToday, setHourlyToday] = useState<HourBar[]>([])

  useEffect(() => {
    if (!organization) return
    fetchData()
  }, [organization?.id, period])

  const fetchData = async () => {
    if (!organization) return
    setLoading(true)
    try {
      const now = new Date()
      const todayStart = startOfDay(now)
      const daysBack = period === '1d' ? 1 : period === '7d' ? 7 : 30
      const periodStart = subDays(now, daysBack)

      // ── 1. Conversations (with inbox for channel info + assigned agent) ──
      const { data: allConvs } = await supabase
        .from('conversations')
        .select('id, status, created_at, updated_at, ai_handled, inbox:inboxes(channel_type), assigned_agent:agent_profiles!assigned_agent_id(id, full_name)')
        .eq('organization_id', organization.id)

      // ── 2. Messages for response time (within period) ──
      const { data: msgs } = await supabase
        .from('messages')
        .select('conversation_id, sender_type, created_at')
        .eq('organization_id', organization.id)
        .gte('created_at', periodStart.toISOString())
        .order('created_at', { ascending: true })

      // ── 3. Agent profiles ──
      const { data: agentProfiles } = await supabase
        .from('agent_profiles')
        .select('id, full_name')
        .eq('organization_id', organization.id)
        .eq('is_active', true)

      const convs = allConvs || []
      const messages = msgs || []

      // Conversations within the selected period
      const periodConvs = convs.filter(c => new Date(c.created_at) >= periodStart)

      // ── Summary stats ──────────────────────────────────────────────────

      // First response times (period convs only)
      const firstResponseTimes: number[] = []
      const resolutionTimes: number[] = []

      periodConvs.forEach(conv => {
        const convMsgs = messages.filter(m => m.conversation_id === conv.id)
        const firstAgent = convMsgs.find(m => m.sender_type === 'agent')
        if (firstAgent) {
          const mins = (new Date(firstAgent.created_at).getTime() - new Date(conv.created_at).getTime()) / 60000
          if (mins >= 0) firstResponseTimes.push(mins)
        }
        if (conv.status === 'resolved') {
          const mins = (new Date(conv.updated_at).getTime() - new Date(conv.created_at).getTime()) / 60000
          if (mins >= 0) resolutionTimes.push(mins)
        }
      })

      setSummary({
        total: periodConvs.length,
        open: periodConvs.filter(c => c.status === 'open').length,
        in_progress: periodConvs.filter(c => c.status === 'in_progress').length,
        pending: periodConvs.filter(c => c.status === 'pending').length,
        resolved: periodConvs.filter(c => c.status === 'resolved').length,
        resolvedToday: convs.filter(c => c.status === 'resolved' && new Date(c.updated_at) >= todayStart).length,
        aiHandled: periodConvs.filter(c => (c as any).ai_handled).length,
        avgFirstResponseMin: firstResponseTimes.length > 0
          ? firstResponseTimes.reduce((a, b) => a + b, 0) / firstResponseTimes.length
          : null,
        avgResolutionMin: resolutionTimes.length > 0
          ? resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length
          : null,
      })

      // ── Agent leaderboard ──────────────────────────────────────────────

      const agentRows: AgentRow[] = (agentProfiles || []).map(ap => {
        // Conversations resolved within period assigned to this agent
        const myConvs = periodConvs.filter(c => (c.assigned_agent as any)?.id === ap.id)
        const resolved = myConvs.filter(c => c.status === 'resolved').length
        const resolvedToday = convs.filter(c =>
          c.status === 'resolved' &&
          (c.assigned_agent as any)?.id === ap.id &&
          new Date(c.updated_at) >= todayStart
        ).length

        // Avg response time (time from contact msg → agent reply)
        const responseTimes: number[] = []
        myConvs.forEach(conv => {
          const convMsgs = messages.filter(m => m.conversation_id === conv.id)
          for (let i = 0; i < convMsgs.length - 1; i++) {
            if (convMsgs[i].sender_type === 'contact' && convMsgs[i + 1].sender_type === 'agent') {
              const mins = (new Date(convMsgs[i + 1].created_at).getTime() - new Date(convMsgs[i].created_at).getTime()) / 60000
              if (mins >= 0) responseTimes.push(mins)
            }
          }
        })

        return {
          id: ap.id,
          name: ap.full_name,
          resolved,
          resolvedToday,
          avgResponseMin: responseTimes.length > 0
            ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
            : null,
        }
      }).sort((a, b) => b.resolved - a.resolved)

      setAgents(agentRows)

      // ── Channel breakdown ──────────────────────────────────────────────

      const channelMap = new Map<string, { count: number; resolved: number }>()
      periodConvs.forEach(c => {
        const ch = (c.inbox as any)?.channel_type || 'unknown'
        const existing = channelMap.get(ch) || { count: 0, resolved: 0 }
        existing.count++
        if (c.status === 'resolved') existing.resolved++
        channelMap.set(ch, existing)
      })

      setChannels(
        Array.from(channelMap.entries())
          .map(([channel, data]) => ({ channel, ...data }))
          .sort((a, b) => b.count - a.count)
      )

      // ── Volume trend (day bars) ─────────────────────────────────────────

      const dayBars: DayBar[] = []
      for (let i = daysBack - 1; i >= 0; i--) {
        const dayStart = startOfDay(subDays(now, i))
        const dayEnd = i === 0 ? now : startOfDay(subDays(now, i - 1))
        const label = daysBack <= 7
          ? format(dayStart, 'EEE')    // Mon, Tue…
          : format(dayStart, 'MMM d')  // Jan 5…
        const created = periodConvs.filter(c => {
          const d = new Date(c.created_at)
          return d >= dayStart && d < dayEnd
        }).length
        const resolved = convs.filter(c => {
          const d = new Date(c.updated_at)
          return c.status === 'resolved' && d >= dayStart && d < dayEnd
        }).length
        dayBars.push({ label, created, resolved })
      }
      setVolumeTrend(dayBars)

      // ── Today's hourly activity ────────────────────────────────────────

      const hourMap = new Map<number, { created: number; resolved: number }>()
      for (let h = 0; h < 24; h++) hourMap.set(h, { created: 0, resolved: 0 })

      convs.forEach(c => {
        const createdDate = new Date(c.created_at)
        if (createdDate >= todayStart) {
          const h = createdDate.getHours()
          const entry = hourMap.get(h)!
          entry.created++
        }
        if (c.status === 'resolved') {
          const resolvedDate = new Date(c.updated_at)
          if (resolvedDate >= todayStart) {
            const h = resolvedDate.getHours()
            const entry = hourMap.get(h)!
            entry.resolved++
          }
        }
      })

      // Only keep hours with activity (or last 12 hours)
      const currentHour = new Date().getHours()
      const hourBars: HourBar[] = Array.from(hourMap.entries())
        .filter(([h]) => h <= currentHour)
        .map(([h, data]) => ({
          hour: `${h.toString().padStart(2, '0')}:00`,
          ...data,
        }))

      setHourlyToday(hourBars.filter((_, i, arr) => {
        // Show last 12 hours max to avoid crowding
        return i >= arr.length - 12
      }))

    } catch (err) {
      console.error('Reports error:', err)
    } finally {
      setLoading(false)
    }
  }

  const PERIOD_LABELS: Record<Period, string> = {
    '1d': 'Today',
    '7d': 'Last 7 Days',
    '30d': 'Last 30 Days',
  }

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-gray-50">

      {/* Header */}
      <div className="h-14 bg-white border-b border-gray-200 flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-3">
          <BarChart2 className="w-5 h-5 text-primary" />
          <div>
            <h1 className="font-bold text-gray-900 leading-tight">Reports</h1>
            <p className="text-[11px] text-gray-400">{PERIOD_LABELS[period]}</p>
          </div>
        </div>

        {/* Period selector */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {(['1d', '7d', '30d'] as Period[]).map(p => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={cn(
                'px-4 py-1.5 text-sm font-semibold rounded-md transition-all',
                period === p
                  ? 'bg-white text-primary shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-primary mx-auto mb-3" />
            <p className="text-sm text-gray-500">Loading analytics…</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* ── Summary stat cards ─────────────────────────────────── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Conversations"
              value={summary?.total ?? 0}
              sub={PERIOD_LABELS[period]}
              color="bg-blue-100 text-blue-600"
              icon={MessageCircle}
            />
            <StatCard
              label="Resolved"
              value={summary?.resolved ?? 0}
              sub={`${summary && summary.total > 0 ? Math.round((summary.resolved / summary.total) * 100) : 0}% resolution rate`}
              color="bg-green-100 text-green-600"
              icon={CheckCircle}
            />
            <StatCard
              label="Resolved Today"
              value={summary?.resolvedToday ?? 0}
              color="bg-emerald-100 text-emerald-600"
              icon={TrendingUp}
            />
            <StatCard
              label="AI Handled"
              value={summary?.aiHandled ?? 0}
              sub={`${summary && summary.total > 0 ? Math.round(((summary.aiHandled ?? 0) / summary.total) * 100) : 0}% of tickets`}
              color="bg-violet-100 text-violet-600"
              icon={Zap}
            />
          </div>

          {/* Response time metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-amber-500" />
                <p className="text-xs text-gray-500 font-medium">Avg First Response</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {summary?.avgFirstResponseMin != null ? formatDur(summary.avgFirstResponseMin) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Time from ticket created → first agent reply</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-blue-500" />
                <p className="text-xs text-gray-500 font-medium">Avg Resolution Time</p>
              </div>
              <p className="text-3xl font-bold text-gray-900">
                {summary?.avgResolutionMin != null ? formatDur(summary.avgResolutionMin) : '—'}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">Time from created → resolved</p>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-2">
                <Users className="w-4 h-4 text-gray-400" />
                <p className="text-xs text-gray-500 font-medium">Status Breakdown</p>
              </div>
              <div className="space-y-1.5">
                {[
                  { label: 'Open', val: summary?.open ?? 0, cls: 'bg-blue-500' },
                  { label: 'In Progress', val: summary?.in_progress ?? 0, cls: 'bg-amber-500' },
                  { label: 'Pending', val: summary?.pending ?? 0, cls: 'bg-orange-500' },
                ].map(s => {
                  const total = summary?.total || 1
                  return (
                    <div key={s.label} className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-20 flex-shrink-0">{s.label}</span>
                      <div className="flex-1 bg-gray-100 rounded-full h-2">
                        <div
                          className={cn('h-2 rounded-full', s.cls)}
                          style={{ width: `${Math.round((s.val / total) * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 w-6 text-right">{s.val}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* ── Volume trend + Today's activity ────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Volume trend */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-bold text-gray-900 text-sm mb-4">
                Ticket Volume — {PERIOD_LABELS[period]}
              </h3>
              {volumeTrend.length > 0 ? (
                <div style={{ height: '200px' }}>
                  <BarChart
                    data={volumeTrend}
                    bars={[
                      { key: 'created', color: '#3b82f6', label: 'Created' },
                      { key: 'resolved', color: '#22c55e', label: 'Resolved' },
                    ]}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No data for this period</div>
              )}
            </div>

            {/* Today's hourly activity */}
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h3 className="font-bold text-gray-900 text-sm mb-4">Today's Activity (by hour)</h3>
              {hourlyToday.some(h => h.created > 0 || h.resolved > 0) ? (
                <div style={{ height: '200px' }}>
                  <BarChart
                    data={hourlyToday.map(h => ({ ...h, label: h.hour.slice(0, 5) }))}
                    bars={[
                      { key: 'created', color: '#6366f1', label: 'Created' },
                      { key: 'resolved', color: '#22c55e', label: 'Resolved' },
                    ]}
                  />
                </div>
              ) : (
                <div className="flex items-center justify-center h-40 text-gray-400 text-sm">No activity today yet</div>
              )}
            </div>
          </div>

          {/* ── Agent leaderboard + Channel breakdown ──────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* Agent leaderboard */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-sm">Agent Leaderboard</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{PERIOD_LABELS[period]}</p>
              </div>
              {agents.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">No agent data</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-gray-100 bg-gray-50">
                        <th className="text-left py-2.5 px-5 text-xs font-semibold text-gray-500">Agent</th>
                        <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500">Resolved</th>
                        <th className="text-right py-2.5 px-4 text-xs font-semibold text-gray-500">Today</th>
                        <th className="text-right py-2.5 px-5 text-xs font-semibold text-gray-500">Avg Response</th>
                      </tr>
                    </thead>
                    <tbody>
                      {agents.map((agent, i) => (
                        <tr
                          key={agent.id}
                          className={cn(
                            'border-b border-gray-50 last:border-0',
                            agent.id === profile?.id && 'bg-primary/3'
                          )}
                        >
                          <td className="py-3 px-5">
                            <div className="flex items-center gap-2">
                              {i === 0 && (
                                <span className="text-amber-500 text-xs">🥇</span>
                              )}
                              {i === 1 && (
                                <span className="text-gray-400 text-xs">🥈</span>
                              )}
                              {i === 2 && (
                                <span className="text-orange-400 text-xs">🥉</span>
                              )}
                              {i > 2 && (
                                <span className="text-xs text-gray-300 w-4">{i + 1}</span>
                              )}
                              <span className="text-sm font-semibold text-gray-900">
                                {agent.name}
                                {agent.id === profile?.id && (
                                  <span className="ml-1 text-[10px] text-primary font-bold">(you)</span>
                                )}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-bold text-green-600">{agent.resolved}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <span className="text-sm font-semibold text-gray-700">{agent.resolvedToday}</span>
                          </td>
                          <td className="py-3 px-5 text-right">
                            <span className="text-sm text-gray-600">
                              {agent.avgResponseMin != null ? formatDur(agent.avgResponseMin) : '—'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Channel breakdown */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100">
                <h3 className="font-bold text-gray-900 text-sm">Tickets by Channel</h3>
                <p className="text-[11px] text-gray-400 mt-0.5">{PERIOD_LABELS[period]}</p>
              </div>
              {channels.length === 0 ? (
                <div className="p-6 text-center text-sm text-gray-400">No tickets this period</div>
              ) : (
                <div className="p-5 space-y-3">
                  {channels.map(ch => {
                    const total = channels.reduce((s, c) => s + c.count, 0)
                    const pct = total > 0 ? Math.round((ch.count / total) * 100) : 0
                    const Icon = CHANNEL_ICONS[ch.channel] || MessageCircle
                    const colorCls = CHANNEL_COLORS[ch.channel] || 'text-gray-600 bg-gray-100'
                    const resolvePct = ch.count > 0 ? Math.round((ch.resolved / ch.count) * 100) : 0
                    return (
                      <div key={ch.channel} className="flex items-center gap-3">
                        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', colorCls)}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-semibold text-gray-900">
                              {CHANNEL_LABELS[ch.channel] || ch.channel}
                            </span>
                            <span className="text-sm font-bold text-gray-900">{ch.count}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 bg-gray-100 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full bg-primary"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[11px] text-gray-400 flex-shrink-0">
                              {pct}% · {resolvePct}% resolved
                            </span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  )
}