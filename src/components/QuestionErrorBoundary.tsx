import React from 'react';

interface Props {
  /** 用于在题目切换时重置错误状态 */
  resetKey?: string;
  /** 出错时展示的提示文案 */
  fallbackText?: string;
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * 题目渲染错误边界
 *
 * 单道题目渲染异常时只降级该题区域，不影响整个笔试专区页面。
 */
export class QuestionErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error)
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('[题目渲染异常]', error, info?.componentStack);
  }

  componentDidUpdate(prevProps: Props) {
    // 切换到另一道题时自动恢复
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-center">
          <p className="text-sm font-semibold text-amber-900">
            {this.props.fallbackText || '该题数据异常，已自动跳过'}
          </p>
          <p className="text-xs text-amber-700 mt-1">
            请点击「下一题」继续练习。
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
