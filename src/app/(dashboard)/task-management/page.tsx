import { getCurrentUserId } from '@/lib/auth/server/get-current-user-id';
import TaskManagementClient from './TaskManagementClient';

export default async function TaskManagementPage() {
  try {
    const userId = await getCurrentUserId();

    if (!userId) {
      return (
        <div className="max-w-7xl mx-auto p-4">
          <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
            <p className="text-slate-500 mb-4">请先登录</p>
          </div>
        </div>
      );
    }

    return <TaskManagementClient />;
  } catch (error) {
    console.error('获取用户信息失败:', error);
    return (
      <div className="max-w-7xl mx-auto p-4">
        <div className="flex flex-col items-center justify-center py-12 border-2 border-dashed border-slate-200 rounded-lg">
          <p className="text-slate-500 mb-4">获取用户信息失败</p>
        </div>
      </div>
    );
  }
}
