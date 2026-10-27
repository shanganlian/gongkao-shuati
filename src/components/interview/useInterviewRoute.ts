/**
 * 面试大厅 v1.0 · hash 路由状态
 *
 * pushState 修改 hash 不会触发 hashchange，因此这里在 navigate 里同步 setRoute；
 * 浏览器前进/后退会触发 popstate / hashchange，两者都按最新 hash 解析。
 */
import { useCallback, useEffect, useState } from 'react';
import {
  buildInterviewHash,
  parseInterviewRoute,
  type InterviewRoute,
} from './interviewRoutes';

function readRoute(): InterviewRoute {
  if (typeof window === 'undefined') return { name: 'lobby' };
  return parseInterviewRoute(window.location.hash);
}

export function useInterviewRoute(): {
  route: InterviewRoute;
  navigate: (next: InterviewRoute) => void;
} {
  const [route, setRoute] = useState<InterviewRoute>(readRoute);

  useEffect(() => {
    const sync = () => setRoute(readRoute());
    window.addEventListener('popstate', sync);
    window.addEventListener('hashchange', sync);
    return () => {
      window.removeEventListener('popstate', sync);
      window.removeEventListener('hashchange', sync);
    };
  }, []);

  const navigate = useCallback((next: InterviewRoute) => {
    const hash = buildInterviewHash(next);
    if (window.location.hash !== hash) {
      window.history.pushState(null, '', hash);
    }
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return { route, navigate };
}
