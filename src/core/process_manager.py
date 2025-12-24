#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
============================================
Project: AutoForms 2.0
File: process_manager.py
Created: 2025-12-24
Author: @lewopxd

Description:
Process Manager - Gestión de recursos entre Antigravity y AutoForms.
Suspende procesos de Antigravity y asigna prioridad máxima a pywebview.
============================================
"""

import ctypes
from ctypes import wintypes
from typing import List, Optional, Tuple
import os
import atexit
import threading
import time

# ============================================
# WINDOWS API SETUP
# ============================================

# Load Windows DLLs
try:
    ntdll = ctypes.WinDLL('ntdll', use_last_error=True)
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    psapi = ctypes.WinDLL('psapi', use_last_error=True)
    
    # Toolhelp32 prototypes for robustness
    kernel32.CreateToolhelp32Snapshot.argtypes = [wintypes.DWORD, wintypes.DWORD]
    kernel32.CreateToolhelp32Snapshot.restype = wintypes.HANDLE
    
    kernel32.Process32FirstW.argtypes = [wintypes.HANDLE, ctypes.c_void_p]
    kernel32.Process32FirstW.restype = wintypes.BOOL
    
    kernel32.Process32NextW.argtypes = [wintypes.HANDLE, ctypes.c_void_p]
    kernel32.Process32NextW.restype = wintypes.BOOL
except OSError as e:
    print(f"[ProcessManager] Warning: Could not load Windows DLLs: {e}")
    ntdll = None
    kernel32 = None
    psapi = None

# Process access rights
PROCESS_SUSPEND_RESUME = 0x0800
PROCESS_QUERY_INFORMATION = 0x0400
PROCESS_SET_INFORMATION = 0x0200
PROCESS_ALL_ACCESS = 0x001F0FFF

# Priority classes
IDLE_PRIORITY_CLASS = 0x00000040
BELOW_NORMAL_PRIORITY_CLASS = 0x00004000
NORMAL_PRIORITY_CLASS = 0x00000020
ABOVE_NORMAL_PRIORITY_CLASS = 0x00008000
HIGH_PRIORITY_CLASS = 0x00000080
REALTIME_PRIORITY_CLASS = 0x00000100

# NTSTATUS codes
STATUS_SUCCESS = 0

# Toolhelp32 constants
TH32CS_SNAPPROCESS = 0x00000002

class PROCESSENTRY32(ctypes.Structure):
    _fields_ = [
        ("dwSize", wintypes.DWORD),
        ("cntUsage", wintypes.DWORD),
        ("th32ProcessID", wintypes.DWORD),
        ("th32DefaultHeapID", ctypes.POINTER(wintypes.ULONG)),
        ("th32ModuleID", wintypes.DWORD),
        ("cntThreads", wintypes.DWORD),
        ("th32ParentProcessID", wintypes.DWORD),
        ("pcPriClassBase", wintypes.LONG),
        ("dwFlags", wintypes.DWORD),
        ("szExeFile", wintypes.WCHAR * 260)
    ]


class ProcessManager:
    """
    Singleton para gestión de recursos del sistema.
    
    Funcionalidades:
    - Suspender todos los procesos de Antigravity
    - Asignar prioridad HIGH a pywebview
    - Restaurar todo al despertar
    
    Usage:
        ProcessManager.hibernate_antigravity()  # Suspende Antigravity
        ProcessManager.boost_current_process()  # Prioridad HIGH a pywebview
        ProcessManager.wake_antigravity()       # Resume Antigravity
    """
    
    _suspended_pids: List[int] = []
    _antigravity_main_pid: Optional[int] = None
    _original_priority: Optional[int] = None
    _is_hibernating: bool = False
    _atexit_registered: bool = False
    _boost_monitor_running: bool = False
    _boosted_pids: List[int] = []
    
    # ============================================
    # LOW-LEVEL WINDOWS API
    # ============================================
    
    @classmethod
    def _get_all_pids(cls) -> List[int]:
        """Obtiene todos los PIDs del sistema."""
        if not psapi:
            return []
        
        # Buffer para hasta 4096 procesos
        arr = (wintypes.DWORD * 4096)()
        size = wintypes.DWORD()
        
        if not psapi.EnumProcesses(ctypes.byref(arr), ctypes.sizeof(arr), ctypes.byref(size)):
            return []
        
        count = size.value // ctypes.sizeof(wintypes.DWORD)
        return [arr[i] for i in range(count) if arr[i] != 0]
    
    @classmethod
    def _get_process_name(cls, pid: int) -> Optional[str]:
        """Obtiene el nombre de un proceso por su PID."""
        if not kernel32:
            return None
        
        try:
            handle = kernel32.OpenProcess(PROCESS_QUERY_INFORMATION, False, pid)
            if not handle:
                return None
            
            try:
                # Buffer para el nombre
                name_buffer = ctypes.create_unicode_buffer(260)
                size = wintypes.DWORD(260)
                
                # Intentar GetProcessImageFileNameW
                if psapi.GetProcessImageFileNameW(handle, name_buffer, size):
                    full_path = name_buffer.value
                    # Extraer solo el nombre del archivo
                    return full_path.split('\\')[-1].lower()
            finally:
                kernel32.CloseHandle(handle)
        except Exception:
            pass
        
        return None
    
    @classmethod
    def _suspend_process(cls, pid: int) -> bool:
        """Suspende un proceso usando NtSuspendProcess."""
        if not ntdll or not kernel32:
            return False
        
        try:
            handle = kernel32.OpenProcess(PROCESS_SUSPEND_RESUME, False, pid)
            if not handle:
                print(f"[ProcessManager] Could not open process {pid}")
                return False
            
            try:
                status = ntdll.NtSuspendProcess(handle)
                success = status == STATUS_SUCCESS
                if success:
                    print(f"[ProcessManager] Suspended PID {pid}")
                else:
                    print(f"[ProcessManager] NtSuspendProcess failed for PID {pid}, status={status}")
                return success
            finally:
                kernel32.CloseHandle(handle)
        except Exception as e:
            print(f"[ProcessManager] Error suspending PID {pid}: {e}")
            return False
    
    @classmethod
    def _resume_process(cls, pid: int) -> bool:
        """Resume un proceso usando NtResumeProcess."""
        if not ntdll or not kernel32:
            return False
        
        try:
            handle = kernel32.OpenProcess(PROCESS_SUSPEND_RESUME, False, pid)
            if not handle:
                print(f"[ProcessManager] Could not open process {pid} for resume")
                return False
            
            try:
                status = ntdll.NtResumeProcess(handle)
                success = status == STATUS_SUCCESS
                if success:
                    print(f"[ProcessManager] Resumed PID {pid}")
                else:
                    print(f"[ProcessManager] NtResumeProcess failed for PID {pid}, status={status}")
                return success
            finally:
                kernel32.CloseHandle(handle)
        except Exception as e:
            print(f"[ProcessManager] Error resuming PID {pid}: {e}")
            return False
    
    @classmethod
    def _set_priority(cls, pid: int, priority: int) -> bool:
        """Establece la prioridad de un proceso."""
        if not kernel32:
            return False
        
        try:
            handle = kernel32.OpenProcess(PROCESS_SET_INFORMATION, False, pid)
            if not handle:
                return False
            
            try:
                success = kernel32.SetPriorityClass(handle, priority)
                return bool(success)
            finally:
                kernel32.CloseHandle(handle)
        except Exception:
            return False
    
    @classmethod
    def _get_priority(cls, pid: int) -> Optional[int]:
        """Obtiene la prioridad actual de un proceso."""
        if not kernel32:
            return None
        
        try:
            handle = kernel32.OpenProcess(PROCESS_QUERY_INFORMATION, False, pid)
            if not handle:
                return None
            
            try:
                priority = kernel32.GetPriorityClass(handle)
                return priority if priority else None
            finally:
                kernel32.CloseHandle(handle)
        except Exception:
            pass
        
        return None
    @classmethod
    def _get_child_pids(cls, parent_pid: int) -> List[int]:
        """Obtiene todos los PIDs hijos directos de un padre usando Toolhelp32."""
        if not kernel32:
            return []
        
        children = []
        hSnapshot = kernel32.CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0)
        if hSnapshot == -1:
            return []
            
        try:
            pe = PROCESSENTRY32()
            pe.dwSize = ctypes.sizeof(PROCESSENTRY32)
            
            if kernel32.Process32FirstW(hSnapshot, ctypes.byref(pe)):
                while True:
                    if pe.th32ParentProcessID == parent_pid:
                        children.append(pe.th32ProcessID)
                    if not kernel32.Process32NextW(hSnapshot, ctypes.byref(pe)):
                        break
        finally:
            kernel32.CloseHandle(hSnapshot)
            
        return children

    @classmethod
    def get_all_descendants(cls, parent_pid: int) -> List[int]:
        """Obtiene todos los descendientes (hijos, nietos...) de forma recursiva."""
        descendants = []
        to_process = [parent_pid]
        
        while to_process:
            current_parent = to_process.pop(0)
            children = cls._get_child_pids(current_parent)
            for child_pid in children:
                if child_pid not in descendants:
                    descendants.append(child_pid)
                    to_process.append(child_pid)
                    
        return descendants
    
    # ============================================
    # ANTIGRAVITY DETECTION
    # ============================================
    
    @classmethod
    def find_antigravity_processes(cls) -> List[int]:
        """
        Encuentra todos los PIDs de procesos Antigravity.
        Busca exhaustivamente por múltiples patrones de nombre.
        
        Returns: Lista de PIDs ordenados por valor (para suspensión ordenada)
        """
        # Patrones de procesos relacionados con Antigravity IDE
        # Incluir todas las variaciones posibles
        target_patterns = [
            'antigravity',
            'language_server',          # Captura language_server_windows_x64.exe
            'language-server',          # Variación con guión
            'languageserver',           # Sin separador
        ]
        
        pids = cls._get_all_pids()
        antigravity_pids = []
        found_names = []  # Para logging
        
        print(f"[ProcessManager] Scanning {len(pids)} system processes...")
        
        for pid in pids:
            name = cls._get_process_name(pid)
            if name:
                name_lower = name.lower()
                for pattern in target_patterns:
                    if pattern in name_lower:
                        antigravity_pids.append(pid)
                        found_names.append(f"{name} (PID {pid})")
                        break
        
        # Log detallado de lo que encontramos
        if found_names:
            print(f"[ProcessManager] Found processes to hibernate:")
            for fn in found_names:
                print(f"[ProcessManager]   - {fn}")
        else:
            # Si no encontramos nada, hacer un scan más agresivo y reportar
            print("[ProcessManager] WARNING: No target processes found!")
            print("[ProcessManager] Doing verbose scan for debugging...")
            cls._debug_scan_processes()
        
        # Ordenar por PID descendente (hijos primero, asumiendo PIDs más altos = más nuevos)
        antigravity_pids.sort(reverse=True)
        
        return antigravity_pids
    
    @classmethod
    def _debug_scan_processes(cls):
        """Escanea y muestra todos los procesos para debugging."""
        pids = cls._get_all_pids()
        interesting = []
        
        for pid in pids:
            name = cls._get_process_name(pid)
            if name:
                name_lower = name.lower()
                # Buscar cualquier cosa que parezca relacionada
                keywords = ['anti', 'gravity', 'lang', 'server', 'code', 'electron']
                for kw in keywords:
                    if kw in name_lower:
                        interesting.append(f"{name} (PID {pid})")
                        break
        
        if interesting:
            print("[ProcessManager] Potentially related processes found:")
            for p in interesting[:20]:  # Limitar a 20
                print(f"[ProcessManager]   ? {p}")
        else:
            print("[ProcessManager] No potentially related processes found")
    
    # ============================================
    # MAIN API
    # ============================================
    
    @classmethod
    def hibernate_antigravity(cls) -> bool:
        """
        HIBERNAR Antigravity:
        1. Encuentra todos los procesos Antigravity
        2. Los suspende (PIDs descendentes = hijos primero)
        3. Marca estado como hibernando
        
        Returns: True si al menos un proceso fue suspendido
        """
        if cls._is_hibernating:
            print("[ProcessManager] Already hibernating")
            return True
        
        # Registrar atexit handler para seguridad
        if not cls._atexit_registered:
            atexit.register(cls._emergency_wake)
            cls._atexit_registered = True
        
        pids = cls.find_antigravity_processes()
        
        if not pids:
            print("[ProcessManager] No Antigravity processes found")
            return False
        
        print(f"[ProcessManager] Found {len(pids)} Antigravity processes")
        
        # Guardar el PID principal (el de menor valor, probablemente el padre)
        cls._antigravity_main_pid = min(pids)
        
        # Suspender todos (orden descendente = hijos primero)
        cls._suspended_pids = []
        success_count = 0
        
        for pid in pids:
            if cls._suspend_process(pid):
                cls._suspended_pids.append(pid)
                success_count += 1
        
        if success_count > 0:
            cls._is_hibernating = True
            print(f"[ProcessManager] ✓ Hibernated {success_count}/{len(pids)} Antigravity processes")
            return True
        else:
            print("[ProcessManager] ✗ Failed to hibernate any Antigravity process")
            return False
    
    @classmethod
    def boost_current_process(cls) -> bool:
        """
        BOOST pywebview:
        1. Guarda prioridad original del proceso actual
        2. Asigna HIGH_PRIORITY_CLASS al proceso actual
        
        Returns: True si exitoso
        """
        my_pid = os.getpid()
        
        # Guardar prioridad original
        cls._original_priority = cls._get_priority(my_pid)
        
        # Asignar HIGH
        if cls._set_priority(my_pid, HIGH_PRIORITY_CLASS):
            print(f"[ProcessManager] ✓ Current process (PID {my_pid}) set to HIGH priority")
            return True
        else:
            print(f"[ProcessManager] ✗ Failed to boost current process priority")
            return False
            
    @classmethod
    def boost_webview_monitor(cls):
        """
        Lanza un monitor en segundo plano para dar boost a los procesos de WebView2.
        Infalible: Busca por árbol de procesos de forma recursiva.
        """
        if cls._boost_monitor_running:
            return
            
        def monitor_task():
            cls._boost_monitor_running = True
            cls._boosted_pids = []
            my_pid = os.getpid()
            
            print("[ProcessManager] Boost monitor started (targeting WebView2 children)")
            
            # Patrones de procesos de renderizado
            webview_patterns = ['msedgewebview2', 'msedge', 'webview2']
            
            # Monitorear intensamente los primeros 15 segundos
            start_time = time.time()
            while time.time() - start_time < 15:
                # Obtener descendientes directos e indirectos
                descendants = cls.get_all_descendants(my_pid)
                
                for pid in descendants:
                    if pid in cls._boosted_pids:
                        continue
                        
                    name = cls._get_process_name(pid)
                    if name:
                        name_lower = name.lower()
                        is_webview = any(p in name_lower for p in webview_patterns)
                        
                        if is_webview:
                            if cls._set_priority(pid, HIGH_PRIORITY_CLASS):
                                cls._boosted_pids.append(pid)
                                print(f"[ProcessManager] 🚀 BOOSTED WebView2 process: {name} (PID {pid})")
                
                time.sleep(1.0) # Escanear cada segundo
                
            cls._boost_monitor_running = False
            print(f"[ProcessManager] Boost monitor finished. Boosted {len(cls._boosted_pids)} child processes.")

        thread = threading.Thread(target=monitor_task, daemon=True)
        thread.start()
    
    @classmethod
    def wake_antigravity(cls) -> bool:
        """
        DESPERTAR Antigravity:
        1. Restaura prioridad del proceso actual a NORMAL
        2. Resume todos los procesos suspendidos (orden ascendente = padre primero)
        3. Asigna HIGH_PRIORITY_CLASS a Antigravity (proceso principal)
        
        Returns: True si exitoso
        """
        if not cls._is_hibernating:
            print("[ProcessManager] Not hibernating, nothing to wake")
            return True
        
        # Restaurar prioridad del proceso actual
        my_pid = os.getpid()
        original = cls._original_priority if cls._original_priority else NORMAL_PRIORITY_CLASS
        cls._set_priority(my_pid, original)
        print(f"[ProcessManager] Restored current process priority to NORMAL")
        
        # Resumir procesos en orden ascendente (padre primero)
        resumed_count = 0
        for pid in sorted(cls._suspended_pids):
            if cls._resume_process(pid):
                resumed_count += 1
        
        # Asignar HIGH priority al proceso principal de Antigravity
        if cls._antigravity_main_pid:
            if cls._set_priority(cls._antigravity_main_pid, HIGH_PRIORITY_CLASS):
                print(f"[ProcessManager] ✓ Antigravity main process (PID {cls._antigravity_main_pid}) set to HIGH priority")
        
        # Limpiar estado
        cls._suspended_pids = []
        cls._antigravity_main_pid = None
        cls._is_hibernating = False
        
        print(f"[ProcessManager] ✓ Woke {resumed_count} Antigravity processes")
        return resumed_count > 0
    
    @classmethod
    def is_hibernating(cls) -> bool:
        """Retorna True si Antigravity está hibernando."""
        return cls._is_hibernating
    
    @classmethod
    def _emergency_wake(cls):
        """Handler de emergencia para atexit - despierta Antigravity si el proceso termina."""
        if cls._is_hibernating:
            print("[ProcessManager] EMERGENCY: Waking Antigravity on exit...")
            # Resumir sin cambiar prioridades, solo asegurar que despierte
            for pid in sorted(cls._suspended_pids):
                try:
                    cls._resume_process(pid)
                except Exception:
                    pass
            cls._is_hibernating = False
            print("[ProcessManager] EMERGENCY: Wake complete")
