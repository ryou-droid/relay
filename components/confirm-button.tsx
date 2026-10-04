"use client";
export default function ConfirmButton({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <button
      className="danger secondary"
      onClick={(e) => {
        if (!window.confirm("削除しますか？操作履歴は保存されます。"))
          e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
