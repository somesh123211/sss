import { useEffect, useRef } from 'react'
import { ArgoProfile, ComparisonData } from '../services/api'

interface ProfileChartProps {
  profile: ArgoProfile
  comparison?: ComparisonData | null
}

export default function ProfileChart({ profile, comparison }: ProfileChartProps) {
  const tempRef = useRef<HTMLDivElement>(null)
  const psalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!tempRef.current || !psalRef.current) return

    import('plotly.js-dist-min').then((Plotly) => {
      const { pres, temp, psal, qc_flag } = profile.data

      const colors = qc_flag.map(f => {
        if (f === 'ok') return 'rgba(0, 212, 255, 0.85)'
        if (f === 'suspect_psal' || f === 'suspect_temp_zero') return 'rgba(255, 170, 0, 0.85)'
        return 'rgba(255, 68, 68, 0.7)'
      })

      const commonLayout = {
        paper_bgcolor: 'rgba(2,13,26,0)',
        plot_bgcolor: 'rgba(2,13,26,0)',
        font: { family: 'Inter, sans-serif', size: 10, color: '#8ba7bb' },
        margin: { l: 45, r: 10, t: 10, b: 35 },
        xaxis: {
          gridcolor: 'rgba(0,212,255,0.08)',
          zerolinecolor: 'rgba(0,212,255,0.15)',
          tickfont: { size: 9 },
        },
        yaxis: {
          autorange: 'reversed' as const,
          gridcolor: 'rgba(0,212,255,0.08)',
          zerolinecolor: 'rgba(0,212,255,0.15)',
          tickfont: { size: 9 },
          title: { text: 'Pressure (dbar)', font: { size: 9 } },
        },
        showlegend: comparison?.model ? true : false,
        legend: { x: 0.6, y: 0.1, font: { size: 8 } },
      }

      const commonConfig = {
        responsive: true,
        displayModeBar: false,
        staticPlot: false,
      }

      // Traces for Temperature
      const tempTraces: unknown[] = [
        {
          x: temp,
          y: pres,
          mode: 'lines+markers',
          line: { color: 'rgba(255,82,82,0.85)', width: 1.8 },
          marker: { color: colors, size: 3 },
          name: 'Observed (Argo)',
        }
      ]

      if (comparison?.model && comparison.model.interpolated_at_argo_depths) {
        tempTraces.push({
          x: comparison.model.interpolated_at_argo_depths,
          y: pres,
          mode: 'lines',
          line: { color: '#00ffff', width: 2, dash: 'dash' },
          name: 'HYCOM Model',
        })
      }

      // Temperature chart
      Plotly.default.newPlot(
        tempRef.current!,
        tempTraces as any,
        {
          ...commonLayout,
          xaxis: {
            ...commonLayout.xaxis,
            title: { text: 'Temperature (°C)', font: { size: 9 } },
          },
          height: 180,
        },
        commonConfig,
      )

      // Traces for Salinity
      const psalTraces: unknown[] = [
        {
          x: psal,
          y: pres,
          mode: 'lines+markers',
          line: { color: 'rgba(0,180,163,0.85)', width: 1.8 },
          marker: { color: colors, size: 3 },
          name: 'Observed (Argo)',
        }
      ]

      Plotly.default.newPlot(
        psalRef.current!,
        psalTraces as any,
        {
          ...commonLayout,
          xaxis: {
            ...commonLayout.xaxis,
            title: { text: 'Salinity (PSU)', font: { size: 9 } },
          },
          height: 180,
        },
        commonConfig,
      )
    })


    return () => {
      // Cleanup
      import('plotly.js-dist-min').then((Plotly) => {
        if (tempRef.current) Plotly.default.purge(tempRef.current)
        if (psalRef.current) Plotly.default.purge(psalRef.current)
      })
    }
  }, [profile])

  return (
    <div className="fade-in">
      <div className="info-panel__title" style={{ marginBottom: 8 }}>
        Vertical Profiles
      </div>
      <div style={{
        background: 'rgba(0,0,0,0.2)',
        borderRadius: 8,
        border: '1px solid var(--color-border)',
        overflow: 'hidden',
        padding: '8px 4px 4px',
      }}>
        <div style={{ fontSize: 9, color: 'var(--color-text-muted)', paddingLeft: 12, marginBottom: 2 }}>
          TEMPERATURE vs PRESSURE
        </div>
        <div ref={tempRef} style={{ width: '100%' }} />
        <div style={{
          fontSize: 9, color: 'var(--color-text-muted)',
          paddingLeft: 12, marginTop: 4, marginBottom: 2
        }}>
          SALINITY vs PRESSURE
        </div>
        <div ref={psalRef} style={{ width: '100%' }} />
        <div style={{
          fontSize: 8, color: 'var(--color-text-muted)',
          padding: '4px 12px',
          display: 'flex', gap: 12,
        }}>
          <span style={{ color: 'rgba(0,212,255,0.7)' }}>● QC OK</span>
          <span style={{ color: 'rgba(255,170,0,0.7)' }}>● Suspect</span>
          <span>|</span>
          <span>Source: INCOIS ERDDAP</span>
        </div>
      </div>
    </div>
  )
}
