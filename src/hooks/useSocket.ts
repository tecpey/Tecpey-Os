import { socket } from "@/lib/socket";
import { useEffect } from "react"

export const useSocket = () =>{
    useEffect(()=>{
        const onConnect = () =>{
        };

        socket.on(
            "connect",
            onConnect
        );
        return ()=>{
            socket.off(
                "connect",
                onConnect
            )
        }
    },[])
}