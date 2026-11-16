import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ScrollView, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';

/**
 * Horizontal, paged list of months: swipe the wheel left/right to move between months.
 * `months` oldest first; the page of `selected` is scrolled into view when it changes (e.g. from the arrows).
 */
export function MonthPager({
  months,
  selected,
  onSelect,
  height,
  renderPage,
}: {
  months: string[];
  selected: string;
  onSelect: (month: string) => void;
  height: number;
  renderPage: (month: string, isSelected: boolean) => ReactNode;
}) {
  const [width, setWidth] = useState(0);
  const ref = useRef<ScrollViewInstance>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const index = Math.max(months.indexOf(selected), 0);

  useEffect(() => {
    if (width) ref.current?.scrollTo({ x: index * width, animated: true });
  }, [index, width]);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  // Works on native (momentum end) and on web (no momentum events there): settle shortly after scrolling stops.
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const i = Math.round(x / Math.max(width, 1));
      const m = months[i];
      if (m && m !== selected) onSelect(m);
    }, 140);
  };

  return (
    <View style={{ alignSelf: 'stretch', height }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView
          ref={ref}
          horizontal
          pagingEnabled
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: index * width, y: 0 }}
          // contentOffset is ignored on web and the first scrollTo can run before the pages exist: re-align here.
          onContentSizeChange={() => ref.current?.scrollTo({ x: index * width, animated: false })}
          onScroll={onScroll}
          scrollEventThrottle={32}
          accessibilityLabel="Glisează pentru altă lună"
        >
          {months.map((m) => (
            <View key={m} style={{ width, height, alignItems: 'center', justifyContent: 'center' }}>
              {renderPage(m, m === selected)}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}
