import StudentUpload from "@/components/StudentUpload";
export default async function StudentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return <StudentUpload token={token}/>;
}
