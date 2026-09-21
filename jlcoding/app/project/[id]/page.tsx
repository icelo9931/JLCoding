import { Suspense } from 'react'
import { Workspace } from '@/components/Workspace'

export default function ProjectPage({ params }: { params: { id: string } }) {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-zinc-500">加载中…</div>}>
      <Workspace projectId={params.id} />
    </Suspense>
  )
}
