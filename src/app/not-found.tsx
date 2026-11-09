import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#F4F4F0] text-black flex items-center justify-center p-6">
      <div className="gumroad-card p-8 max-w-md w-full text-center space-y-4">
        <div className="inline-block px-3 py-1 rounded-full bg-[#FFC900] border-2 border-black font-mono text-xs font-black">
          404 • ROUTE NOT FOUND
        </div>
        <h1 className="text-2xl font-black">Page Not Found</h1>
        <p className="text-xs font-medium text-neutral-700">
          Return to the AegisAgent Autonomous Procurement Control Plane.
        </p>
        <Link
          href="/"
          className="gumroad-btn inline-block px-5 py-2.5 bg-[#FF90E8] text-black text-xs"
        >
          Back to Control Plane →
        </Link>
      </div>
    </div>
  );
}
