"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function BroadcastReport() {
  const params = useParams();
  const id = (params?.id as string) || "";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) {
      setError("No broadcast ID");
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      try {
        const res = await fetch(`/api/admin/communications/status?id=${encodeURIComponent(id)}`);
        const json = await res.json();

        if (!res.ok) {
          setError(json.error || "Failed to load");
        } else {
          setData(json.broadcast);
        }
      } catch (err: any) {
        setError(err.message || "Error loading");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id]);

  if (loading) return <div className="p-8">Loading...</div>;
  if (error) return <div className="p-8 text-red-500">{error}</div>;
  if (!data) return <div className="p-8">No data</div>;

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">{data.id}</h1>
      <pre className="bg-black p-4 rounded text-sm overflow-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
