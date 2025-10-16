import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { History as HistoryIcon } from "lucide-react";

export default function HistoryPage() {
    return (
        <div>
            <h1 className="text-2xl font-bold font-headline mb-4">My Attendance History</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Past Records</CardTitle>
                    <CardDescription>This feature is under development. Your attendance history will appear here.</CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center min-h-[200px] text-center text-muted-foreground">
                    <HistoryIcon className="h-12 w-12 mb-4" />
                    <p>No historical data available yet.</p>
                </CardContent>
            </Card>
        </div>
    )
}
