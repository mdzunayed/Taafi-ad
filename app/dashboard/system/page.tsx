import { redirect } from 'next/navigation';

export default function SystemIndex() {
  redirect('/dashboard/system/settings');
}
