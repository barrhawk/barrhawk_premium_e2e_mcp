import React, { useEffect, useState } from 'react';
import { Activity, Cpu, Server, Terminal, Zap } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

function App() {
  const [metrics, setMetrics] = useState<any[]>([]);
  const [latest, setLatest] = useState<any>(null);

  useEffect(() => {
    const evtSource = new EventSource('/events');
    evtSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'metrics') {
        setLatest(data.payload);
        setMetrics((prev) => [...prev.slice(-20), { ...data.payload, time: new Date().toLocaleTimeString() }]);
      }
    };
    return () => evtSource.close();
  }, []);

  return (
    <div className="min-h-screen bg-background p-8 text-foreground font-sans">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-lg bg-primary flex items-center justify-center">
            <Zap className="text-white" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">BarrHawk <span className="text-primary">MAX</span></h1>
            <p className="text-muted-foreground text-sm">Orchestration & Observability</p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="px-3 py-1 bg-green-500/10 text-green-500 rounded-full text-xs font-medium border border-green-500/20 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
            SYSTEM ONLINE
          </div>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card title="CPU Usage" icon={<Cpu size={20} />} value={`${latest?.cpu.toFixed(1)}%`} sub="4 Cores Active" />
        <Card title="Memory" icon={<Server size={20} />} value={`${latest?.memory.toFixed(1)}%`} sub="Heap Allocation" />
        <Card title="Test Runs" icon={<Activity size={20} />} value={latest?.testRuns} sub="Lifetime Total" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-card p-6">
            <h3 className="text-lg font-semibold mb-4">Live Performance</h3>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={metrics}>
                  <XAxis dataKey="time" stroke="#555" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="#555" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#111', border: '1px solid #333' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Line type="monotone" dataKey="cpu" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="memory" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div className="space-y-6">
           <div className="rounded-xl border border-border bg-card p-6 h-full">
            <div className="flex items-center gap-2 mb-4">
              <Terminal size={18} className="text-muted-foreground" />
              <h3 className="text-lg font-semibold">Active Agents</h3>
            </div>
            <div className="space-y-3">
              {['Doctor', 'Igor', 'Frankenstein'].map(agent => (
                <div key={agent} className="flex items-center justify-between p-3 rounded-lg bg-secondary/50 border border-border">
                  <span className="font-medium">{agent}</span>
                  <span className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400">IDLE</span>
                </div>
              ))}
            </div>
           </div>
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, value, sub }: any) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <span className="text-muted-foreground text-sm font-medium">{title}</span>
        <div className="text-muted-foreground">{icon}</div>
      </div>
      <div className="text-3xl font-bold mb-1">{value || '--'}</div>
      <div className="text-xs text-muted-foreground">{sub}</div>
    </div>
  );
}

export default App;
