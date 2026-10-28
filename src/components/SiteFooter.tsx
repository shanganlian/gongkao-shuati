import React, { useState } from 'react';
import { FileText, ShieldCheck, X } from 'lucide-react';

type LegalKind = 'terms' | 'disclaimer' | null;

const LEGAL_CONTENT: Record<Exclude<LegalKind, null>, { title: string; body: string[] }> = {
  terms: {
    title: '用户协议（占位稿）',
    body: [
      '【占位】正式上线前请替换为法务确认后的用户协议。',
      '建议包含：服务内容与额度规则（游客每日 10 题、登录每日 50 题）、账号与邮箱验证、禁止批量抓取/转售题库、付费会员权益与退款规则、免责与争议解决条款。',
    ],
  },
  disclaimer: {
    title: '免责声明（占位稿）',
    body: [
      '【占位】正式上线前请替换为法务确认后的免责声明。',
      '题库内容来源于公开真题与整理资料，仅供个人学习参考，不构成考试承诺；如涉及版权问题请联系删除。AI 评分与解析为辅助工具，最终以官方答案与考试要求为准。',
    ],
  },
};

/**
 * 全站页脚：版权、协议入口、备案号占位。
 * 移动端底部有固定导航，外层布局已留出 pb-20 安全区。
 */
export const SiteFooter: React.FC = () => {
  const [legal, setLegal] = useState<LegalKind>(null);
  const year = new Date().getFullYear();

  return (
    <>
      <footer className="mt-10 border-t border-slate-200/80 bg-white/60">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[11px] text-slate-500">
          <p>© {year} 行岸公考 · 国考 / 省考 / 事业编智能备考</p>
          <div className="flex items-center gap-4">
            <button
              onClick={() => setLegal('terms')}
              className="flex items-center gap-1 hover:text-slate-800 cursor-pointer"
            >
              <FileText className="w-3 h-3" />
              用户协议
            </button>
            <button
              onClick={() => setLegal('disclaimer')}
              className="flex items-center gap-1 hover:text-slate-800 cursor-pointer"
            >
              <ShieldCheck className="w-3 h-3" />
              免责声明
            </button>
            <span className="text-slate-400">备案号：待填写</span>
          </div>
        </div>
      </footer>

      {legal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setLegal(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-bold text-slate-900">{LEGAL_CONTENT[legal].title}</h3>
              <button onClick={() => setLegal(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer" aria-label="关闭">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 text-xs leading-relaxed text-slate-600">
              {LEGAL_CONTENT[legal].body.map((line, index) => (
                <p key={index}>{line}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
