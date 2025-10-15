"use client"

// Inspired by react-hot-toast library
import * as React from "react"
import { type ToastProps as ToastComponentProps } from "@/components/ui/toast"

type ToasterToast = ToastComponentProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: React.ReactElement
}

const TOAST_LIMIT = 1
const TOAST_REMOVE_DELAY = 1000000

type ToasterContextProps = {
  toasts: ToasterToast[]
  toast: (toast: Omit<ToasterToast, "id">) => {
    id: string
    dismiss: () => void
    update: (props: ToasterToast) => void
  }
  dismiss: (toastId?: string) => void
}

const initialState: ToasterContextProps = {
  toasts: [],
  toast: () => {
    throw new Error("You can't use toast outside of a ToasterProvider")
  },
  dismiss: () => {},
}

const ToasterContext = React.createContext<ToasterContextProps>(initialState)

export const useToast = () => {
  const context = React.useContext(ToasterContext)
  if (context === undefined) {
    throw new Error("useToast must be used within a ToasterProvider")
  }
  return context
}

let count = 0

function genId() {
  count = (count + 1) % 100
  return count.toString()
}

type ActionType =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "UPDATE_TOAST"; toast: Partial<ToasterToast> & { id: string } }
  | { type: "DISMISS_TOAST"; toastId?: string }
  | { type: "REMOVE_TOAST"; toastId?: string }

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({ type: "REMOVE_TOAST", toastId })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

const reducer = (state: ToasterContextProps, action: ActionType): ToasterContextProps => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }
    case "DISMISS_TOAST":
      if (action.toastId) {
        addToRemoveQueue(action.toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toastId || action.toastId === undefined
            ? { ...t, open: false }
            : t
        ),
      }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return { ...state, toasts: [] }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
    default:
      return state
  }
}

let memoryState: ToasterContextProps = { ...initialState }

const listeners: Array<(state: ToasterContextProps) => void> = []

function dispatch(action: ActionType) {
  memoryState = reducer(memoryState, action)
  for (const listener of listeners) {
    listener(memoryState)
  }
}

export type ToastProps = Omit<ToasterToast, "id">

export function ToasterProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState(memoryState)
  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  const toast = React.useCallback(
    (props: Omit<ToasterToast, "id">) => {
      const id = genId()
      const update = (props: ToasterToast) =>
        dispatch({ type: "UPDATE_TOAST", toast: props })
      const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

      dispatch({
        type: "ADD_TOAST",
        toast: { ...props, id, open: true, onOpenChange: (open) => {
            if (!open) dismiss()
        }},
      })

      return { id, dismiss, update }
    },
    []
  )

  const dismiss = React.useCallback(
    (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
    []
  )

  return (
    <ToasterContext.Provider
      value={{
        ...state,
        toast,
        dismiss,
      }}
    >
      {children}
    </ToasterContext.Provider>
  )
}
