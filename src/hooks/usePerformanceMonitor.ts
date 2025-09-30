import { useEffect, useRef } from 'react';

interface PerformanceMetrics {
  renderCount: number;
  lastRenderTime: number;
  averageRenderTime: number;
  memoryUsage?: number;
}

export function usePerformanceMonitor(componentName: string) {
  const renderCount = useRef(0);
  const renderTimes = useRef<number[]>([]);
  const startTime = useRef<number>(0);

  useEffect(() => {
    startTime.current = performance.now();
  });

  useEffect(() => {
    const endTime = performance.now();
    const renderTime = endTime - startTime.current;
    
    renderCount.current += 1;
    renderTimes.current.push(renderTime);
    
    // Keep only last 10 render times for average calculation
    if (renderTimes.current.length > 10) {
      renderTimes.current = renderTimes.current.slice(-10);
    }
    
    const averageRenderTime = renderTimes.current.reduce((a, b) => a + b, 0) / renderTimes.current.length;
    
    // Log performance warnings
    if (renderTime > 100) {
      console.warn(`🐌 Slow render in ${componentName}: ${renderTime.toFixed(2)}ms`);
    }
    
    if (renderCount.current > 50) {
      console.warn(`🔄 High render count in ${componentName}: ${renderCount.current} renders`);
    }
    
    // Check memory usage if available
    const memoryInfo = (performance as any).memory;
    if (memoryInfo && memoryInfo.usedJSHeapSize > 100 * 1024 * 1024) { // 100MB
      console.warn(`🧠 High memory usage: ${(memoryInfo.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB`);
    }
    
    const metrics: PerformanceMetrics = {
      renderCount: renderCount.current,
      lastRenderTime: renderTime,
      averageRenderTime,
      memoryUsage: memoryInfo?.usedJSHeapSize
    };
    
    // Log metrics in development
    if (process.env.NODE_ENV === 'development') {
      // Performance monitoring disabled in production
      // console.log(`📊 ${componentName} metrics:`, metrics);
    }
    
    return () => {
      // Cleanup if needed
    };
  });

  return {
    renderCount: renderCount.current,
    resetMetrics: () => {
      renderCount.current = 0;
      renderTimes.current = [];
    }
  };
}
