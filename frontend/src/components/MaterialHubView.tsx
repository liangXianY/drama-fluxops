import React, { useState, useRef } from 'react';
import { Upload, Layers, Check, AlertCircle, X, Search } from 'lucide-react';
import { MaterialAsset, AdAccount, UploadBatchResult } from '../api/client';

interface Props {
  materials: MaterialAsset[];
  accounts: AdAccount[];
  breakEvenRoi: number;
  onUploadFiles: (items: Array<Record<string, unknown>>) => Promise<UploadBatchResult>;
  onMockImport: () => Promise<UploadBatchResult>;
  onBatchBuild: (payload: {
    material_ids: number[];
    account_codes: string[];
    bid_rois: number[];
    daily_budget: number;
  }) => Promise<void>;
  onJumpToTrafficPool: () => void;
}

/**
 * 浏览器本地零阻塞分片抽样计算文件哈希 (头2MB + 尾2MB + 字节长度)
 */
async function computeSampleHash(file: File): Promise<string> {
  const CHUNK = 2 * 1024 * 1024;
  const head = await file.slice(0, Math.min(file.size, CHUNK)).arrayBuffer();
  const tail = file.size > CHUNK ? await file.slice(Math.max(0, file.size - CHUNK), file.size).arrayBuffer() : new ArrayBuffer(0);
  const sizeBytes = new TextEncoder().encode(`${file.size}`);

  const merged = new Uint8Array(head.byteLength + tail.byteLength + sizeBytes.byteLength);
  merged.set(new Uint8Array(head), 0);
  merged.set(new Uint8Array(tail), head.byteLength);
  merged.set(sizeBytes, head.byteLength + tail.byteLength);

  const hashBuf = await crypto.subtle.digest('SHA-256', merged);
  return Array.from(new Uint8Array(hashBuf))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * 离线 Video DOM 探针解析本地视频真实宽高与时长
 */
function probeVideoMetadata(file: File): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const res = {
        width: video.videoWidth || 1080,
        height: video.videoHeight || 1920,
        duration: Number.isFinite(video.duration) ? video.duration : 42.0,
      };
      URL.revokeObjectURL(url);
      resolve(res);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 1080, height: 1920, duration: 42.0 });
    };
    video.src = url;
  });
}

const STATUS_BADGE: Record<string, { label: string; cls: string }> = {
  READY: { label: '待首投', cls: 'bg-sky-50 text-sky-700 border-sky-200' },
  ACTIVE: { label: '在投跑量', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  PAUSED: { label: '衰退停投', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  REJECTED: { label: '审核驳回', cls: 'bg-red-50 text-red-700 border-red-200' },
};

const POOL_LABELS: Record<string, string> = {
  OBSERVING: '观察池',
  TESTING: '测试池',
  SCALING: '放量池',
  ELIMINATED: '淘汰池',
};

export const MaterialHubView: React.FC<Props> = ({
  materials,
  accounts,
  breakEvenRoi,
  onUploadFiles,
  onMockImport,
  onBatchBuild,
  onJumpToTrafficPool,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 入库打标元数据
  const [uploadDrama, setUploadDrama] = useState('除夕夜真千金杀疯了');
  const [uploadEditor, setUploadEditor] = useState('阿杰');
  const [uploadHook, setUploadHook] = useState('认亲打脸');
  const [uploading, setUploading] = useState(false);
  const [lastBatchReceipt, setLastBatchReceipt] = useState<UploadBatchResult | null>(null);

  // 台账筛选状态
  const [filterEditor, setFilterEditor] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [searchText, setSearchText] = useState('');

  // 批量勾选与叉乘抽屉状态
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>(['KWAI_101', 'OCEAN_201']);
  const [selectedBids, setSelectedBids] = useState<number[]>([0.88, 0.92]);
  const [unitBudget, setUnitBudget] = useState<number>(150);
  const [submittingBatch, setSubmittingBatch] = useState(false);

  const editors = Array.from(new Set(materials.map((m) => m.editor_name)));
  const dramas = Array.from(new Set(materials.map((m) => m.drama_name)));

  const filteredMaterials = materials.filter((m) => {
    if (filterEditor !== 'ALL' && m.editor_name !== filterEditor) return false;
    if (filterStatus !== 'ALL' && m.audit_status !== filterStatus) return false;
    if (
      searchText.trim() &&
      !m.file_name.toLowerCase().includes(searchText.toLowerCase()) &&
      !m.material_code.toLowerCase().includes(searchText.toLowerCase()) &&
      !m.drama_name.includes(searchText)
    ) {
      return false;
    }
    return true;
  });

  const selectableIds = filteredMaterials.filter((m) => m.audit_status !== 'REJECTED').map((m) => m.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));

  const handleRealFileSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const parsedItems = [];
      for (const file of Array.from(files)) {
        const [md5_hash, meta] = await Promise.all([computeSampleHash(file), probeVideoMetadata(file)]);
        parsedItems.push({
          file_name: file.name,
          md5_hash,
          drama_name: uploadDrama,
          editor_name: uploadEditor,
          hook_type: uploadHook,
          width: meta.width,
          height: meta.height,
          duration_sec: Number(meta.duration.toFixed(1)),
          file_size_mb: Number((file.size / (1024 * 1024)).toFixed(2)) || 12.5,
        });
      }
      const receipt = await onUploadFiles(parsedItems);
      setLastBatchReceipt(receipt);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleMockBatch = async () => {
    setUploading(true);
    try {
      const receipt = await onMockImport();
      setLastBatchReceipt(receipt);
    } finally {
      setUploading(false);
    }
  };

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelectedIds(Array.from(new Set([...selectedIds, ...selectableIds])));
    }
  };

  const toggleAccount = (code: string) => {
    setSelectedAccounts((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const toggleBid = (bid: number) => {
    setSelectedBids((prev) => (prev.includes(bid) ? prev.filter((b) => b !== bid) : [...prev, bid].sort()));
  };

  const totalCartesianPlans = selectedIds.length * selectedAccounts.length * selectedBids.length;
  const totalNewBudget = totalCartesianPlans * unitBudget;

  return (
    <div className="space-y-5">
      {/* 模块一：批量视频预处理入库区 (本地MD5抽样指纹 + 9:16规格探针) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              短剧切片批量上传与本地预检（Web Crypto 指纹去重 + 9:16 竖屏规格校验）
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              支持拖入本地 .mp4 视频文件自动提取分辨率、时长与文件哈希；同 MD5 视频秒级拦截复用已有素材编号
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              multiple
              className="hidden"
              onChange={(e) => handleRealFileSelect(e.target.files)}
            />
            <button
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="px-3.5 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium flex items-center gap-1.5 transition"
            >
              <Upload className="w-3.5 h-3.5" />
              选择本地视频批量上传
            </button>
            <button
              disabled={uploading}
              onClick={handleMockBatch}
              className="px-3.5 py-2 rounded-md bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-300 text-xs font-medium transition"
              title="一键模拟导入：1条合规竖屏新片 + 1条重复MD5拦截片 + 1条横屏规格告警片"
            >
              模拟批量导入 3 条测试切片
            </button>
          </div>
        </div>

        {/* 入库归因标签配置 */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
          <div>
            <label className="block text-xs text-gray-500 mb-1">上传绑定所属短剧</label>
            <select
              value={uploadDrama}
              onChange={(e) => setUploadDrama(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs text-gray-900"
            >
              {dramas.map((d) => (
                <option key={d} value={d}>
                  《{d}》
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">责任剪辑师（用于核算爆款率绩效）</label>
            <select
              value={uploadEditor}
              onChange={(e) => setUploadEditor(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs text-gray-900"
            >
              <option value="阿杰">阿杰（男频/逆袭组）</option>
              <option value="林晓">林晓（女频甜宠组）</option>
              <option value="陈思思">陈思思（悬疑/年代组）</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">前 3 秒剧情钩子分类</label>
            <select
              value={uploadHook}
              onChange={(e) => setUploadHook(e.target.value)}
              className="w-full bg-white border border-gray-300 rounded-md px-3 py-1.5 text-xs text-gray-900"
            >
              <option value="认亲打脸">认亲打脸</option>
              <option value="身份反差">身份反差（掉马甲）</option>
              <option value="退婚高燃">退婚高燃</option>
              <option value="年代逆袭">年代逆袭</option>
              <option value="悬念卡点">悬念卡点</option>
            </select>
          </div>
        </div>

        {/* 批次质检结果回执面板 */}
        {lastBatchReceipt && (
          <div className="mt-4 bg-gray-50 border border-gray-200 rounded-md p-3.5">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-gray-900">
                本次批量质检结果：新增入库 <span className="text-emerald-600">{lastBatchReceipt.created_count}</span> 条 ·
                MD5去重拦截 <span className="text-blue-600">{lastBatchReceipt.duplicate_count}</span> 条 · 规格告警{' '}
                <span className="text-amber-600">{lastBatchReceipt.warning_count}</span> 条
              </div>
              <button
                onClick={() => setLastBatchReceipt(null)}
                className="text-xs text-gray-400 hover:text-gray-700"
              >
                收起回执
              </button>
            </div>
            <div className="space-y-1.5">
              {lastBatchReceipt.results.map((r, idx) => (
                <div key={idx} className="text-xs flex flex-wrap items-center justify-between bg-white px-3 py-1.5 rounded border border-gray-200/80">
                  <span className="font-medium text-gray-800">{r.file_name}</span>
                  <span
                    className={
                      r.outcome === 'DUPLICATE'
                        ? 'text-blue-600'
                        : r.outcome === 'SPEC_WARNING'
                        ? 'text-amber-600'
                        : 'text-emerald-600'
                    }
                  >
                    {r.message}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 模块二：跨渠道素材资产台账 & 勾选批量叉乘入口 */}
      <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-gray-400 absolute left-3 top-2.5" />
              <input
                placeholder="搜索素材编号 / 文件名 / 剧名..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-300 rounded-md text-xs text-gray-900 w-56 focus:bg-white focus:border-blue-500 focus:outline-none"
              />
            </div>

            <select
              value={filterEditor}
              onChange={(e) => setFilterEditor(e.target.value)}
              className="bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-xs text-gray-700"
            >
              <option value="ALL">全部剪辑师</option>
              {editors.map((ed) => (
                <option key={ed} value={ed}>
                  剪辑师：{ed}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-white border border-gray-300 rounded-md px-2.5 py-1.5 text-xs text-gray-700"
            >
              <option value="ALL">全部状态 ({materials.length})</option>
              <option value="READY">待首投新片</option>
              <option value="ACTIVE">在投跑量中</option>
              <option value="PAUSED">衰退已停投</option>
              <option value="REJECTED">媒体审核驳回</option>
            </select>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="text-xs text-gray-500">
              已选 <strong className="text-blue-600">{selectedIds.length}</strong> 条合规切片
            </span>
            <button
              disabled={selectedIds.length === 0}
              onClick={() => setDrawerOpen(true)}
              className="px-4 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-xs font-medium flex items-center gap-1.5 transition"
            >
              <Layers className="w-3.5 h-3.5" />
              批量叉乘新建广告组
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
              <tr>
                <th className="py-3 px-4 w-10">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    className="rounded border-gray-300 text-blue-600"
                  />
                </th>
                <th className="py-3 px-3 font-medium">素材编号 / 文件名称 / MD5指纹</th>
                <th className="py-3 px-3 font-medium">所属短剧 / 剪辑师</th>
                <th className="py-3 px-3 font-medium">画面规格 / 时长</th>
                <th className="py-3 px-3 font-medium">跨渠道云端同步</th>
                <th className="py-3 px-3 font-medium">素材状态 / 流量池</th>
                <th className="py-3 px-3 font-medium">累计消耗 / 充值额</th>
                <th className="py-3 px-4 font-medium text-right">首日ROI (回本率)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-gray-700">
              {filteredMaterials.map((m) => {
                const isRejected = m.audit_status === 'REJECTED';
                const checked = selectedIds.includes(m.id);
                const st = STATUS_BADGE[m.audit_status] || STATUS_BADGE.READY;

                return (
                  <tr
                    key={m.id}
                    className={`${isRejected ? 'bg-red-50/25 opacity-75' : 'hover:bg-gray-50/80'} ${
                      checked ? 'bg-blue-50/40' : ''
                    }`}
                  >
                    <td className="py-3 px-4">
                      <input
                        type="checkbox"
                        disabled={isRejected}
                        checked={checked}
                        onChange={() => toggleSelectOne(m.id)}
                        title={isRejected ? m.reject_reason : '勾选参与批量叉乘建组'}
                        className="rounded border-gray-300 text-blue-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                    </td>
                    <td className="py-3 px-3 max-w-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-semibold text-gray-900">{m.material_code}</span>
                        <span className="text-[11px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-600">
                          {m.hook_type}
                        </span>
                      </div>
                      <div className="text-gray-700 truncate mt-0.5" title={m.file_name}>
                        {m.file_name}
                      </div>
                      <div className="text-[11px] font-mono text-gray-400 mt-0.5">MD5: {m.md5_hash}</div>
                      {isRejected && (
                        <div className="text-[11px] text-red-600 mt-1 flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 shrink-0" />
                          <span>{m.reject_reason}</span>
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3">
                      <div className="font-medium text-gray-900">《{m.drama_name}》</div>
                      <div className="text-gray-500 mt-0.5">剪辑师：{m.editor_name}</div>
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <div className="flex items-center gap-1.5">
                        <span>{m.resolution}</span>
                        {!m.spec_valid && (
                          <span className="font-sans text-[10px] px-1.5 py-0.2 rounded bg-amber-50 text-amber-700 border border-amber-200">
                            非竖屏告警
                          </span>
                        )}
                      </div>
                      <div className="text-gray-500 mt-0.5">
                        {m.duration_sec}s · {m.file_size_mb}MB
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col gap-1 text-[11px]">
                        <span className={m.kwai_sync_status === 'SYNCED' ? 'text-emerald-700' : 'text-red-600'}>
                          快手磁力：{m.kwai_sync_status === 'SYNCED' ? '已同步' : '已拒审'}
                        </span>
                        <span
                          className={
                            m.ocean_sync_status === 'SYNCED'
                              ? 'text-blue-700'
                              : m.ocean_sync_status === 'PENDING'
                              ? 'text-gray-400'
                              : 'text-red-600'
                          }
                        >
                          抖音巨量：{m.ocean_sync_status === 'SYNCED' ? '已同步' : m.ocean_sync_status === 'PENDING' ? '待推送' : '已拒审'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <span className={`inline-block px-2 py-0.5 rounded border text-[11px] font-medium ${st.cls}`}>
                        {st.label}
                      </span>
                      {m.pool_stage && (
                        <button
                          onClick={onJumpToTrafficPool}
                          className="block text-[11px] text-blue-600 hover:underline mt-1"
                        >
                          所在池：{POOL_LABELS[m.pool_stage] || m.pool_stage} ({m.active_plans}组在投)
                        </button>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono">
                      <div>¥{m.ad_cost.toFixed(1)}</div>
                      <div className="text-emerald-600 mt-0.5">¥{m.ad_gmv.toFixed(1)}</div>
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-semibold">
                      {m.ad_cost > 0 ? (
                        <span className={m.first_day_roi >= breakEvenRoi ? 'text-emerald-600' : 'text-red-600'}>
                          {m.first_day_roi.toFixed(2)}
                        </span>
                      ) : (
                        <span className="text-gray-400 font-normal">--</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 笛卡尔积批量叉乘建组抽屉 */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 bg-gray-900/35 backdrop-blur-[1px] flex justify-end">
          <div className="bg-white border-l border-gray-200 w-full max-w-lg h-full flex flex-col shadow-xl">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">批量叉乘新建广告组（跨渠道矩阵基建）</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  自动按「已选素材 × 目标账户 × 出价梯度」生成计划并推送至测试池监控
                </p>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
              <div>
                <div className="font-semibold text-gray-900 mb-2">1. 已选短剧切片素材 ({selectedIds.length} 条)</div>
                <div className="bg-gray-50 border border-gray-200 rounded-md p-3 space-y-1.5 max-h-32 overflow-y-auto">
                  {materials
                    .filter((m) => selectedIds.includes(m.id))
                    .map((m) => (
                      <div key={m.id} className="flex items-center justify-between text-gray-700">
                        <span className="truncate">
                          <strong className="font-mono mr-1.5">{m.material_code}</strong>
                          {m.file_name}
                        </span>
                        <span className="text-gray-400 shrink-0 ml-2">{m.editor_name}</span>
                      </div>
                    ))}
                </div>
              </div>

              <div>
                <div className="font-semibold text-gray-900 mb-2">
                  2. 选择目标投放账户（支持快手磁力智投 + 抖音巨量同步分发）
                </div>
                <div className="space-y-2">
                  {accounts.map((acc) => {
                    const checked = selectedAccounts.includes(acc.account_code);
                    return (
                      <label
                        key={acc.account_code}
                        onClick={() => toggleAccount(acc.account_code)}
                        className={`flex items-center justify-between p-3 rounded-md border cursor-pointer transition ${
                          checked ? 'border-blue-500 bg-blue-50/40' : 'border-gray-200 hover:bg-gray-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-4 h-4 rounded flex items-center justify-center border ${
                              checked ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-300 bg-white'
                            }`}
                          >
                            {checked && <Check className="w-3 h-3" />}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{acc.account_name}</div>
                            <div className="text-[11px] text-gray-500 font-mono">
                              账户编号: {acc.account_code} · 当前在投 {acc.active_plans} 组
                            </div>
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                            acc.channel === 'KWAI'
                              ? 'bg-orange-50 text-orange-700 border border-orange-200'
                              : 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          }`}
                        >
                          {acc.channel === 'KWAI' ? '快手磁力' : '抖音巨量'}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div>
                <div className="font-semibold text-gray-900 mb-2">
                  3. 选择目标首日 ROI (充值回本率) 阶梯出价档位（多选测人群）
                </div>
                <div className="flex flex-wrap gap-2">
                  {[0.85, 0.88, 0.90, 0.92, 0.95, 1.00].map((bid) => {
                    const active = selectedBids.includes(bid);
                    return (
                      <button
                        key={bid}
                        type="button"
                        onClick={() => toggleBid(bid)}
                        className={`px-3 py-1.5 rounded-md border font-mono text-xs font-medium transition ${
                          active
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        ROI {bid.toFixed(2)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-gray-900 mb-1.5">4. 单个新建广告组测试日预算 (¥)</label>
                <input
                  type="number"
                  step="10"
                  value={unitBudget}
                  onChange={(e) => setUnitBudget(parseFloat(e.target.value) || 100)}
                  className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm text-gray-900 font-mono"
                />
              </div>

              {/* 叉乘预览计算器 */}
              <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-4 space-y-1.5">
                <div className="text-xs font-semibold text-blue-900">笛卡尔积建组计算预览：</div>
                <div className="text-sm font-bold text-blue-700 font-mono">
                  {selectedIds.length} 条素材 × {selectedAccounts.length} 个账户 × {selectedBids.length} 档出价 = 共生成{' '}
                  {totalCartesianPlans} 个广告组
                </div>
                <div className="text-xs text-blue-800/80">
                  预计新增日预算总额：<strong>¥{totalNewBudget.toLocaleString('zh-CN')}</strong>（将同步校验单小时自动加仓安全锁余量）
                </div>
              </div>
            </div>

            <div className="p-5 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-2.5">
              <button
                onClick={() => setDrawerOpen(false)}
                className="px-4 py-2 rounded-md bg-white border border-gray-300 text-xs text-gray-700 hover:bg-gray-100"
              >
                取消
              </button>
              <button
                disabled={submittingBatch || totalCartesianPlans === 0}
                onClick={async () => {
                  setSubmittingBatch(true);
                  try {
                    await onBatchBuild({
                      material_ids: selectedIds,
                      account_codes: selectedAccounts,
                      bid_rois: selectedBids,
                      daily_budget: unitBudget,
                    });
                    setSelectedIds([]);
                    setDrawerOpen(false);
                  } finally {
                    setSubmittingBatch(false);
                  }
                }}
                className="px-5 py-2 rounded-md bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium transition"
              >
                {submittingBatch ? '正在推入队列创建...' : `确认创建 ${totalCartesianPlans} 个广告组并送入测试池`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
