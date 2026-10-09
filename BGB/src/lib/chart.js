import {
  ArcElement,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Filler,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, LineElement, PointElement, Filler, Legend, Tooltip);

ChartJS.defaults.font.family = "'Inter', ui-sans-serif, system-ui, sans-serif";
ChartJS.defaults.color = '#6b7280';
ChartJS.defaults.maintainAspectRatio = false;
ChartJS.defaults.responsive = true;

export const PALETTE = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];

/** Legend at bottom on narrow screens, right on wide ones */
export const legendPosition = (isNarrow) => (isNarrow ? 'bottom' : 'right');

export const axisOptions = (fontSize) => ({
  y: { beginAtZero: true, ticks: { font: { size: fontSize }, precision: 0 }, grid: { color: '#f3f4f6' } },
  x: { ticks: { font: { size: fontSize } }, grid: { display: false } },
});
