import { Suspense } from 'react';
import ReportsClient from './ReportsClient';

export default function ReportsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ReportsClient />
    </Suspense>
  );
}
