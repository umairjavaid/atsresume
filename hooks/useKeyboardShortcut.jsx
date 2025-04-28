import { useEffect } from 'react';

const useKeyboardShortcut = (key, ctrlKey, callback) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Check if event.key exists before calling toLowerCase
      if (event.key && event.key.toLowerCase() === key.toLowerCase() && event.ctrlKey === ctrlKey) {
        event.preventDefault();
        callback();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [key, ctrlKey, callback]);
};

export default useKeyboardShortcut;