import { Card, Section, StatusPill } from "../RestaurantCards";
import { getStaffConsoleData, roleLabels } from "../../services/restaurantConsoleService";

export function StaffListPanel() {
  const data = getStaffConsoleData();

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <button className="rounded-md bg-teal-700 px-4 py-2 text-sm font-bold text-white">新增人員</button>
        <button className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700">指派角色</button>
        <button className="rounded-md border border-stone-300 bg-white px-4 py-2 text-sm font-bold text-stone-700">調店</button>
      </div>
      <Section title="人員列表" subtitle="登入帳號與員工資料分離；員工可以沒有後台登入權限。">
        <Card className="overflow-x-auto">
          <table className="min-w-[760px] w-full text-left text-sm">
            <thead className="text-xs uppercase text-stone-500">
              <tr className="border-b border-stone-200">
                <th className="py-3 pr-4">姓名</th>
                <th className="py-3 pr-4">職稱</th>
                <th className="py-3 pr-4">分店</th>
                <th className="py-3 pr-4">角色</th>
                <th className="py-3 pr-4">登入權限</th>
                <th className="py-3 pr-4">狀態</th>
                <th className="py-3 pr-4">生效日</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((employee) => (
                <tr className="border-b border-stone-100" key={employee.id}>
                  <td className="py-3 pr-4 font-bold text-stone-950">{employee.name}</td>
                  <td className="py-3 pr-4">{employee.title}</td>
                  <td className="py-3 pr-4">{employee.branchName}</td>
                  <td className="py-3 pr-4">{employee.roleLabel}</td>
                  <td className="py-3 pr-4"><StatusPill tone={employee.hasConsoleAccess ? "good" : "muted"}>{employee.loginState}</StatusPill></td>
                  <td className="py-3 pr-4"><StatusPill tone={employee.status === "active" ? "good" : "bad"}>{employee.status === "active" ? "啟用" : "停用"}</StatusPill></td>
                  <td className="py-3 pr-4">{employee.effectiveDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>
    </>
  );
}

export function BranchAssignmentPanel() {
  const data = getStaffConsoleData();
  return (
    <Section title="分店配置" subtitle="只處理指派分店、角色與生效日期，不包含排班或打卡。">
      <div className="grid gap-4 md:grid-cols-3">
        {data.branches.map((branch) => (
          <Card key={branch.id}>
            <h3 className="font-black text-stone-950">{branch.name}</h3>
            <p className="mt-1 text-sm text-stone-500">{branch.address}</p>
            <div className="mt-4 grid gap-2">
              {data.assignments.filter((assignment) => assignment.branchId === branch.id).map((assignment) => (
                <div className="rounded-md bg-stone-50 p-3" key={assignment.id}>
                  <p className="font-bold text-stone-900">{assignment.employeeName}</p>
                  <p className="text-sm text-stone-500">{assignment.roleLabel} · {assignment.effectiveDate}</p>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </Section>
  );
}

export function RolePermissionPanel() {
  return (
    <Section title="職位與權限" subtitle="第一階段只管理後台角色，不延伸到薪資、請假、績效或招募。">
      <div className="grid gap-4 md:grid-cols-2">
        {Object.entries(roleLabels).map(([role, label]) => (
          <Card key={role}>
            <h3 className="font-black text-stone-950">{label}</h3>
            <p className="mt-2 text-sm leading-6 text-stone-600">{permissionCopy[role] ?? "可查看必要的營運資料。"}</p>
          </Card>
        ))}
      </div>
    </Section>
  );
}

export function TransferLogPanel() {
  const data = getStaffConsoleData();
  return (
    <Section title="調動紀錄">
      <Card className="overflow-x-auto">
        <table className="min-w-[760px] w-full text-left text-sm">
          <thead className="text-xs uppercase text-stone-500">
            <tr className="border-b border-stone-200">
              <th className="py-3 pr-4">員工</th>
              <th className="py-3 pr-4">原分店</th>
              <th className="py-3 pr-4">新分店</th>
              <th className="py-3 pr-4">操作者</th>
              <th className="py-3 pr-4">生效日期</th>
              <th className="py-3 pr-4">備註</th>
            </tr>
          </thead>
          <tbody>
            {data.transfers.map((log) => (
              <tr className="border-b border-stone-100" key={log.id}>
                <td className="py-3 pr-4 font-bold text-stone-950">{log.employeeName}</td>
                <td className="py-3 pr-4">{log.fromBranchName}</td>
                <td className="py-3 pr-4">{log.toBranchName}</td>
                <td className="py-3 pr-4">{log.operator}</td>
                <td className="py-3 pr-4">{log.effectiveDate}</td>
                <td className="py-3 pr-4">{log.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Section>
  );
}

const permissionCopy: Record<string, string> = {
  owner: "可管理店家、分店、角色與所有資料草稿。",
  manager: "可處理待確認餐點、分店配置與日常營運資料。",
  nutrition_editor: "可編輯營養資料與建立營養標誌草稿。",
  branch_staff: "可查看所屬分店資料並回報待處理事項。",
  viewer: "僅可查看指定資料，不可送出異動草稿。"
};
