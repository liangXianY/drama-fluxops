import React from 'react';
import { X } from 'lucide-react';
import { FeishuCard } from '../api/client';

interface Props {
  open: boolean;
  cards: FeishuCard[];
  onClose: () => void;
  onDecide: (cardId: number, decision: 'APPROVE' | 'REJECT') => void;
}

export const FeishuCardDrawer: React.FC<Props> = ({ open, cards, onClose, onDecide }) => {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-gray-900/30 backdrop-blur-[1px] flex justify-end">
      <div className="bg-white border-l border-gray-200 w-full max-w-md h-full flex flex-col shadow-xl">
        <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">飞书协同机器人 · 人工确认卡片</h2>
            <p className="text-xs text-gray-500 mt-0.5">大额加仓突破安全锁或主力剧边际回本跳水时触发人工审批</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-gray-50/70">
          {cards.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-12">当前暂无待处理的飞书审批卡片</p>
          ) : (
            cards.map((c) => (
              <div key={c.id} className="rounded-lg overflow-hidden border border-gray-200 bg-white shadow-sm">
                <div
                  className={`px-4 py-2.5 text-xs font-semibold text-white flex items-center justify-between ${
                    c.card_type === 'MARGINAL_DROP_WARN' ? 'bg-amber-600' : 'bg-blue-600'
                  }`}
                >
                  <span>{c.title}</span>
                  <span className="font-mono opacity-90">{c.timestamp_label}</span>
                </div>

                <div className="p-4 space-y-3 text-xs">
                  <div className="text-gray-700 leading-relaxed">{c.summary_text}</div>
                  <div className="bg-gray-50 border border-gray-200 rounded p-2.5 text-gray-800">
                    <span className="text-gray-500">建议执行方案：</span>
                    <span className="font-medium">{c.suggested_action}</span>
                  </div>

                  {c.status === 'PENDING' ? (
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => onDecide(c.id, 'APPROVE')}
                        className="flex-1 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium transition"
                      >
                        批准并立即执行
                      </button>
                      <button
                        onClick={() => onDecide(c.id, 'REJECT')}
                        className="px-3.5 py-2 rounded-md bg-white hover:bg-gray-50 text-gray-600 border border-gray-300 transition"
                      >
                        暂不处理
                      </button>
                    </div>
                  ) : (
                    <div className="text-right text-xs font-medium text-gray-500">
                      处理状态：{c.status === 'APPROVED' ? '已批准并同步至磁力智投接口' : '已忽略（30分钟内不再重复提醒）'}
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
