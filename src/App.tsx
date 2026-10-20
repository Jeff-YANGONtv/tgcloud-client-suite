import { useEffect, useState, type ReactNode } from 'react';
import './App.css';

type Tab = 'overview' | 'history' | 'points';
type Channel = { id: number; name: string; url?: string | null; postedCount: number; dailyTarget: number };
type Campaign = { id: number; name: string; startsAt: string | Date; endsAt: string | Date; usedBudgetKs: number; channels: Channel[] };
type HistoryItem = { id: number; name: string; startsAt: string | Date; endsAt: string | Date; usedBudgetKs: number; channelCount: number };
type Loyalty = { startsAt: string | Date; endsAt: string | Date; usedBudgetKs: number; earnedPoints: number; redeemedPoints: number; availablePoints: number; pointRate: string; earningRate: string };
type DashboardPayload = { client: { firstName: string }; today: string; campaigns: Campaign[] };
type ProfileError = Error & { parameters?: { code?: string } };
const EMPTY_CAMPAIGNS: Campaign[] = [];
const TODAY_LABEL = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Yangon' }).format(new Date());

const demoDashboard: DashboardPayload = {
  client: { firstName: 'မိတ်ဖက်' }, today: '2026-10-20',
  campaigns: [
    { id: 1, name: 'Autumn collection', startsAt: '2026-10-01', endsAt: '2026-10-30', usedBudgetKs: 420000, channels: [
      { id: 11, name: 'Yangon Lifestyle', url: 'https://t.me/', postedCount: 20, dailyTarget: 30 },
      { id: 12, name: 'Market Daily', url: 'https://t.me/', postedCount: 18, dailyTarget: 30 },
    ] },
    { id: 2, name: 'Weekend offers', startsAt: '2026-10-12', endsAt: '2026-11-10', usedBudgetKs: 180000, channels: [
      { id: 21, name: 'City Picks', url: 'https://t.me/', postedCount: 9, dailyTarget: 30 },
    ] },
  ],
};
const demoHistory: HistoryItem[] = [
  { id: 3, name: 'September launch', startsAt: '2026-09-01', endsAt: '2026-09-30', usedBudgetKs: 850000, channelCount: 3 },
  { id: 4, name: 'Back to school', startsAt: '2026-08-08', endsAt: '2026-09-06', usedBudgetKs: 640000, channelCount: 2 },
];
const demoLoyalty: Loyalty = {
  startsAt: '2026-09-24', endsAt: '2026-11-23', usedBudgetKs: 1_240_000,
  earnedPoints: 62, redeemedPoints: 12, availablePoints: 50,
  pointRate: '1,000 Ks = 1 point', earningRate: 'used budget ရဲ့ 5%',
};

function callEndpoint<T>(name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const call = window.Telegram?.WebApp?.Serverless?.call;
    if (!call) return reject(new Error('Mini App ၏ Serverless API ကို မရရှိနိုင်ပါ။'));
    call<T>(name, {}, (error, result) => error ? reject(error) : resolve(result as T));
  });
}
function dateLabel(value: string | Date) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', timeZone: 'Asia/Yangon' }).format(new Date(value));
}
function money(value: number) { return `${new Intl.NumberFormat('en-US').format(value)} Ks`; }
function duration(start: string | Date, end: string | Date) {
  const total = Math.max(1, Math.ceil((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000) + 1);
  const elapsed = Math.max(0, Math.min(total, Math.ceil((Date.now() - new Date(start).getTime()) / 86_400_000)));
  return { total, elapsed, pct: Math.round((elapsed / total) * 100) };
}
function Icon({ name }: { name: 'overview' | 'history' | 'points' | 'arrow' | 'channel' | 'calendar' | 'spark' | 'chevron' }) {
  const paths: Record<string, ReactNode> = {
    overview: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="4" rx="1.5"/><rect x="13.5" y="9.5" width="7" height="10" rx="1.5"/><rect x="3.5" y="12.5" width="7" height="7" rx="1.5"/></>,
    history: <><path d="M3.5 11a8.5 8.5 0 1 0 2.4-5.9L3.5 7.5"/><path d="M3.5 3.5v4h4M12 7v5l3.2 1.8"/></>,
    points: <><path d="m12 3 2.7 5.5 6 .9-4.35 4.25 1.03 6-5.38-2.83-5.38 2.83 1.03-6L3.3 9.4l6-.9L12 3Z"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    channel: <><rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M8 9h8M8 13h5"/></>,
    calendar: <><rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3.5v3M16 3.5v3M3.5 10h17"/></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function App() {
  const inTelegram = Boolean(window.Telegram?.WebApp?.Serverless);
  const [tab, setTab] = useState<Tab>('overview');
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(inTelegram ? null : demoDashboard);
  const [history, setHistory] = useState<HistoryItem[]>(inTelegram ? [] : demoHistory);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(inTelegram ? null : demoLoyalty);
  const [error, setError] = useState<ProfileError | null>(null);
  const [loading, setLoading] = useState(inTelegram);

  useEffect(() => {
    const app = window.Telegram?.WebApp;
    if (!app) return;
    app.ready(); app.expand();
    app.setHeaderColor?.('#f5f3ed'); app.setBackgroundColor?.('#f5f3ed');
    let alive = true;
    Promise.all([callEndpoint<DashboardPayload>('getDashboard'), callEndpoint<{ history: HistoryItem[] }>('getHistory'), callEndpoint<Loyalty>('getLoyalty')])
      .then(([dash, past, points]) => { if (alive) { setDashboard(dash); setHistory(past.history); setLoyalty(points); } })
      .catch((reason: ProfileError) => { if (alive) setError(reason); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const campaigns = dashboard?.campaigns ?? EMPTY_CAMPAIGNS;
  const totalChannels = campaigns.reduce((n, c) => n + c.channels.length, 0);
  const greeting = dashboard?.client.firstName || 'မိတ်ဆွေ';
  if (loading) return <div className="loading-screen"><div className="loader-mark"><span /></div><p>သင့်အချက်အလက်များကို ဖွင့်နေသည်။</p></div>;
  if (error) {
    const pending = error.parameters?.code === 'PENDING_APPROVAL';
    return <main className="access-screen"><div className="brand-mark">M</div><p className="eyebrow">CLIENT SPACE</p><h1>{pending ? 'အတည်ပြုချက်ကို စောင့်ဆိုင်းနေသည်' : 'ယခုဖွင့်၍ မရသေးပါ'}</h1><p>{error.message}</p><div className="access-note">{pending ? 'Admin က အတည်ပြုပြီးနောက် သင့် Dashboard၊ မှတ်တမ်းနဲ့ point တွေ ဒီနေရာမှာ ပေါ်လာပါမယ်။' : 'Telegram ထဲမှာ bot ကိုဖွင့်ပြီး Mini App ကို ပြန်ဖွင့်ပါ။'}</div></main>;
  }
  return <div className="app-shell">
    {inTelegram ? null : <div className="demo-strip"><span className="demo-dot"/> DEMO PREVIEW <span>Bot မချိတ်ဆက်ရသေး · ဥပမာဒေတာ</span></div>}
    <header className="topbar"><div className="brand-lockup"><div className="brand-mark">M</div><div><div className="brand-name">CLIENT SPACE</div><div className="brand-sub">ကြော်ငြာအလုပ် စီမံမှု</div></div></div><button className="avatar" aria-label="Client profile">{greeting.slice(0, 1)}</button></header>
    <main className="page-content">
      {tab === 'overview' && <>
        <section className="intro-block"><div className="eyebrow">MYANMAR · {TODAY_LABEL}</div><h1>မင်္ဂလာပါ,<br/><em>{greeting}.</em></h1><p className="intro-copy">လက်ရှိကြော်ငြာလုပ်ငန်းများ၏ အခြေအနေ.</p></section>
        <section className="summary-row"><div className="summary-main"><div className="summary-label">လက်ရှိကြော်ငြာများ</div><div className="summary-value">{String(campaigns.length).padStart(2, '0')}<span> campaign</span></div><div className="summary-meta"><span className="status-pip"/> {totalChannels} channel · ဆောင်ရွက်နေသည်</div><div className="summary-rule"><span style={{ width: `${campaigns.length ? Math.min(totalChannels * 18, 100) : 0}%` }}/></div></div><div className="summary-side"><span className="side-icon"><Icon name="points"/></span><span className="side-label">အသုံးပြုနိုင်သော POINT</span><strong>{loyalty?.availablePoints ?? 0}</strong><span className="side-foot">60 ရက်စက်ဝန်း</span><button onClick={() => setTab('points')} className="text-link">အသေးစိတ် <Icon name="arrow"/></button></div></section>
        <div className="section-heading"><div><p className="eyebrow">လက်ရှိကြော်ငြာစာရင်း</p><h2>လက်ရှိ campaign</h2></div><span className="count-tag">{campaigns.length} TOTAL</span></div>
        {campaigns.length === 0 ? <div className="empty-card"><div className="empty-icon"><Icon name="channel"/></div><h3>လက်ရှိကြော်ငြာ မရှိသေးပါ</h3><p>ကြော်ငြာအသစ် စတင်ပါက ဒီနေရာမှာ အလိုအလျောက် ပြပါမယ်။</p></div> : <div className="campaign-list">{campaigns.map((campaign, index) => { const d = duration(campaign.startsAt, campaign.endsAt); return <article className="campaign-card" key={campaign.id} style={{ animationDelay: `${index * 70}ms` }}>
          <div className="campaign-top"><span className="campaign-index">0{index + 1}</span><div className="campaign-title-wrap"><h3>{campaign.name}</h3><span className="live-badge"><i/> လုပ်ဆောင်နေ</span></div><button className="icon-button" aria-label="မှတ်တမ်းကြည့်ရန်" onClick={() => setTab('history')}><Icon name="chevron"/></button></div>
          <div className="timeline"><div className="timeline-date"><span>စတင်ရက်</span><strong>{dateLabel(campaign.startsAt)}</strong></div><div className="timeline-track"><span style={{ width: `${d.pct}%` }}/><b className="timeline-pin" style={{ left: `${d.pct}%` }}/></div><div className="timeline-date end"><span>ပြီးဆုံးရက်</span><strong>{dateLabel(campaign.endsAt)}</strong></div></div>
          <div className="campaign-footer"><span><Icon name="channel"/> {campaign.channels.length} channel</span><span><Icon name="calendar"/> {d.elapsed}/{d.total} ရက်</span><span className="budget">{money(campaign.usedBudgetKs)}</span></div>
          <div className="channel-list">{campaign.channels.map((channel) => <div className="channel-row" key={channel.id}><div className="channel-avatar">{channel.name.slice(0, 1)}</div><div className="channel-name">{channel.name}<span>ချန်နယ်ပို့စ်</span></div><div className="post-meter"><div className="post-meter-line"><i style={{ width: `${Math.min(100, channel.postedCount / channel.dailyTarget * 100)}%` }}/></div><span>{channel.postedCount}<small>/{channel.dailyTarget}</small></span></div></div>)}</div>
        </article>; })}</div>}
        <section className="quiet-note"><div className="quiet-mark"><Icon name="spark"/></div><p>နေ့စဉ် post link ကို update လုပ်ပြီးနောက် သင့်မှတ်တမ်းထဲ ထည့်ပေးပါမယ်။</p><button onClick={() => setTab('history')} aria-label="မှတ်တမ်းသို့သွားရန်"><Icon name="arrow"/></button></section>
      </>}
      {tab === 'history' && <>
        <section className="intro-block compact"><div className="eyebrow">ယခင်ပူးပေါင်းဆောင်ရွက်မှု</div><h1>လုပ်ငန်း<br/><em>မှတ်တမ်း။</em></h1><p className="intro-copy">ပြီးဆုံးသွားသော campaign များ၏ အကျဉ်းချုပ်။</p></section>
        <div className="section-heading"><div><p className="eyebrow">မှတ်တမ်းဟောင်း</p><h2>ယခင် campaign များ</h2></div><span className="count-tag">{history.length} RECORDS</span></div>
        {history.length ? <div className="history-list">{history.map((item, index) => <article className="history-card" key={item.id} style={{ animationDelay: `${index * 70}ms` }}><div className="history-date"><span>{dateLabel(item.startsAt)}</span><i/><span>{dateLabel(item.endsAt)}</span></div><div className="history-title-row"><h3>{item.name}</h3><span className="done-badge">ပြီးဆုံး</span></div><div className="history-stats"><div><span>အသုံးပြုခဲ့သော ဘတ်ဂျက်</span><strong>{money(item.usedBudgetKs)}</strong></div><div><span>ချန်နယ်</span><strong>{String(item.channelCount).padStart(2, '0')} <small>channel</small></strong></div></div><div className="history-foot"><Icon name="calendar"/> Campaign အကျဉ်းချုပ်ကို သိမ်းဆည်းထားသည်</div></article>)}</div> : <div className="empty-card"><div className="empty-icon"><Icon name="history"/></div><h3>မှတ်တမ်း မရှိသေးပါ</h3><p>ပြီးဆုံးသွားသော campaign များ ဒီနေရာတွင် ပေါ်လာပါမယ်။</p></div>}
        <div className="archive-note"><span className="note-stamp">NOTE</span><p>Post link များကို ရက် ၃၀ ပြည့်လျှင် ဖျက်ပြီး campaign ကာလ၊ ဘတ်ဂျက်နှင့် ချန်နယ်အရေအတွက်ကို မှတ်တမ်းတွင် ဆက်သိမ်းထားမည်။</p></div>
      </>}
      {tab === 'points' && <>
        <section className="intro-block compact"><div className="eyebrow">LOYALTY PROGRAM</div><h1>ပူးပေါင်းမှု၏<br/><em>တန်ဖိုး။</em></h1><p className="intro-copy">အသုံးပြုခဲ့သော ဘတ်ဂျက်အပေါ် အခြေခံ၍ စုဆောင်းထားသော promo point။</p></section>
        <section className="points-card"><div className="points-card-top"><span className="points-seal"><Icon name="spark"/></span><span className="cycle-chip"><i/> လက်ရှိစက်ဝန်း</span></div><div className="points-number">{loyalty?.availablePoints ?? 0}<span>pt</span></div><div className="points-caption">အသုံးပြုနိုင်သော point</div><div className="points-separator"/><div className="point-data"><span>အသုံးပြုခဲ့သော ဘတ်ဂျက်</span><strong>{money(loyalty?.usedBudgetKs ?? 0)}</strong></div><div className="point-data"><span>ရရှိသော point</span><strong>{loyalty?.earnedPoints ?? 0} pt</strong></div><div className="point-data"><span>အသုံးပြုပြီးသော point</span><strong>{loyalty?.redeemedPoints ?? 0} pt</strong></div><div className="cycle-dates"><div><span>စတင်</span><b>{loyalty ? dateLabel(loyalty.startsAt) : '—'}</b></div><div className="cycle-line"><i/></div><div><span>RESET</span><b>{loyalty ? dateLabel(loyalty.endsAt) : '—'}</b></div></div></section>
        <section className="how-card"><div className="how-heading"><span className="eyebrow">POINT တွက်ချက်ပုံ</span><span className="how-number">01—02</span></div><div className="formula"><div><span>ဘတ်ဂျက်</span><strong>5%</strong></div><b>÷</b><div><span>နှုန်း</span><strong>1,000 Ks</strong></div><i>=</i><div className="formula-result"><span>POINT</span><strong>1 pt</strong></div></div><p className="how-foot">ရက် ၆၀ တိုင်း စက်ဝန်းအသစ် စတင်ပြီး ယခင်စက်ဝန်း၏ point လက်ကျန်ကို ပြန်လည်သတ်မှတ်မည်။</p></section>
        <div className="promo-note"><span className="promo-symbol">P</span><p>စုဆောင်းထားသော point ကို နောက်ကြော်ငြာအော်ဒါတွင် promo အဖြစ် အသုံးပြုနိုင်သည်။</p></div>
      </>}
    </main>
    <nav className="bottom-nav" aria-label="အဓိကမီနူး">{([['overview', 'Dashboard'], ['history', 'History'], ['points', 'Point']] as const).map(([key, label]) => <button key={key} className={tab === key ? 'nav-item active' : 'nav-item'} onClick={() => setTab(key)}><span className="nav-icon"><Icon name={key}/></span><span>{label}</span>{tab === key && <i className="nav-indicator"/>}</button>)}</nav>
  </div>;
}
