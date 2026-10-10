import { redirect } from 'next/navigation';

// 目前只有新竹市上線（decisions D12）
export default function Home() {
  redirect('/hsinchu-city');
}
