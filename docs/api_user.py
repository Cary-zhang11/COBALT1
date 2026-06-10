"""
用户相关 API 路由
提供快捷登录接口封装
"""

from typing import Optional, Dict, Any, List
from fastapi import APIRouter, Query, HTTPException, Depends, Header, Body
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, field_validator
import logging
import requests
import secrets
import uuid as uuid_lib
from datetime import datetime, timedelta
from sqlmodel import Session, select, and_
from sqlalchemy import or_
from src.helper.short_url_helper import generate_qrcode
from src.models import UserModel
from src.database import get_db_manager
from api_common import (
    ApiErrorCode,
    create_error_response,
    create_success_response,
    format_datetime,
    get_db_session as common_get_db_session
)

# ============= 日志配置 =============
logger = logging.getLogger("UserAPI")

# ============= 基础 URL =============
BASE_URL = "https://app.corpautohome.com/newautobots/qr"

# ============= 二维码状态常量 =============
class QRStatus:
    """二维码状态常量定义"""
    PENDING = 10      # 待扫码
    SCANNED = 20      # 已扫码
    SUCCESS = 30      # 成功
    EXPIRED = 50      # 过期


# ============= 请求/响应模型定义 =============
class QRGenerateResponse(BaseModel):
    """二维码生成响应模型"""
    uuid: str = Field(..., description="二维码UUID")
    qr_base_code: str = Field(..., description="二维码图片的base64编码，用于前端展示")
    status: int = Field(..., description="状态码（10=待扫码）")


class QRCheckResponse(BaseModel):
    """二维码状态检查响应模型"""
    status: int = Field(..., description="状态码：10=待扫码，20=已扫码，30=成功，50=过期")
    token: Optional[str] = Field(None, description="Token（当status=30时返回）")
    user_info: Optional[Dict[str, Any]] = Field(None, description="用户信息（当status=30时返回）")


class ApiResponse(BaseModel):
    """统一API响应模型"""
    returncode: int
    message: str
    data: dict = Field(default_factory=dict)


class UserBatchUpdateRequest(BaseModel):
    """批量更新用户请求模型"""
    user_ids: List[int] = Field(..., description="要更新的用户ID列表")
    mobile: Optional[str] = Field(None, description="手机号（可选）")
    email: Optional[str] = Field(None, description="邮箱（可选）")
    group: Optional[str] = Field(None, description="用户组（可选）")
    permissions: Optional[dict] = Field(None, description="权限信息（可选，JSON格式）")
    account_status: Optional[str] = Field(None, description="账户状态（可选）：active/inactive/disabled/locked")
    
    @field_validator('account_status')
    @classmethod
    def validate_account_status(cls, v):
        """验证账户状态"""
        if v is not None:
            allowed_statuses = ['active', 'inactive', 'disabled', 'locked']
            if v not in allowed_statuses:
                raise ValueError(f'account_status 必须是以下值之一: {", ".join(allowed_statuses)}')
        return v


# ============= Token 配置 =============
TOKEN_EXPIRY_HOURS = 24 * 7  # Token过期时间（小时），默认7天

# ============= 权限配置 =============
ADMIN_USERS = ['jingjiejie']  # 管理员用户名列表


# ============= 辅助函数 =============
def generate_token() -> str:
    """生成安全的Token
    
    Returns:
        生成的Token字符串
    """
    # 使用 secrets 和 uuid 生成安全的token
    random_part = secrets.token_urlsafe(32)  # 32字节的随机字符串
    uuid_part = uuid_lib.uuid4().hex
    token = f"{random_part}_{uuid_part}"
    return token


# 使用公共模块的数据库会话管理
get_db_session = common_get_db_session


def save_or_update_user(session: Session, user_info: Dict[str, Any], token: str) -> UserModel:
    """保存或更新用户信息
    
    Args:
        session: 数据库会话
        user_info: 用户信息字典（包含 username, portrait 等字段）
        token: 生成的token
        
    Returns:
        保存或更新后的用户模型
        
    Raises:
        Exception: 数据库操作失败时抛出
    """
    username = user_info.get("username")
    if not username:
        raise ValueError("username不能为空")
    
    # 查询用户是否存在
    statement = select(UserModel).where(
        and_(
            UserModel.username == username,
            UserModel.is_del == 0
        )
    )
    existing_user = session.exec(statement).first()
    
    # 计算token过期时间
    token_expiry = datetime.now() + timedelta(hours=TOKEN_EXPIRY_HOURS)
    
    if existing_user:
        # 更新现有用户
        existing_user.portrait = user_info.get("portrait") or existing_user.portrait
        existing_user.mobile = user_info.get("mobile") or existing_user.mobile
        existing_user.email = user_info.get("email") or existing_user.email
        existing_user.group = user_info.get("group") or existing_user.group
        existing_user.permissions = user_info.get("permissions") or existing_user.permissions
        existing_user.account_status = user_info.get("account_status", "active")
        existing_user.token_info = token
        existing_user.token_expiry = token_expiry
        existing_user.updated_time = datetime.now()
        
        # 更新其他字段（如果有）
        if "extras" in user_info:
            if existing_user.extras:
                existing_user.extras.update(user_info["extras"])
            else:
                existing_user.extras = user_info["extras"]
        
        session.add(existing_user)
        session.commit()
        session.refresh(existing_user)
        
        logger.info(f"更新用户信息成功: username={username}")
        return existing_user
    else:
        # 创建新用户
        new_user = UserModel(
            username=username,
            portrait=user_info.get("portrait"),
            mobile=user_info.get("mobile"),
            email=user_info.get("email"),
            group=user_info.get("group"),
            permissions=user_info.get("permissions"),
            account_status=user_info.get("account_status", "active"),
            token_info=token,
            token_expiry=token_expiry,
            extras=user_info.get("extras"),
            description=user_info.get("description"),
            created_name=user_info.get("created_name"),
            created_time=datetime.now(),
            updated_time=datetime.now(),
            dt=datetime.now().date(),
            hour=datetime.now().hour,
            is_del=0
        )
        
        session.add(new_user)
        session.commit()
        session.refresh(new_user)
        
        logger.info(f"创建新用户成功: username={username}")
        return new_user


def verify_token(session: Session, token: str) -> bool:
    """校验Token是否有效
    
    Args:
        session: 数据库会话
        token: 要校验的token
        
    Returns:
        Token有效返回True，否则返回False
    """
    # 复用 get_user_by_token 函数
    user = get_user_by_token(session, token)
    return user is not None


def check_admin_permission(user: UserModel) -> bool:
    """检查用户是否有管理员权限
    
    Args:
        user: 用户模型
        
    Returns:
        如果是管理员返回True，否则返回False
    """
    # 检查用户名是否在管理员列表中
    if user.username in ADMIN_USERS:
        return True
    
    # 检查权限字段（如果有设置的话）
    if user.permissions and isinstance(user.permissions, dict):
        return user.permissions.get('is_admin', False)
    
    return False


def get_user_by_token(session: Session, token: str) -> Optional[UserModel]:
    """根据Token获取用户信息
    
    Args:
        session: 数据库会话
        token: 用户token
        
    Returns:
        用户模型，如果token无效或过期则返回None
    """
    if not token:
        return None
    
    try:
        statement = select(UserModel).where(
            and_(
                UserModel.token_info == token,
                UserModel.is_del == 0,
                UserModel.account_status == "active"
            )
        )
        user = session.exec(statement).first()
        
        if not user:
            logger.debug(f"根据Token获取用户失败: 用户不存在或已禁用")
            return None
        
        # 检查token是否过期
        if user.token_expiry and user.token_expiry < datetime.now():
            logger.debug(f"Token已过期: username={user.username}, expiry={user.token_expiry}")
            return None
        
        return user
    except Exception as e:
        logger.error(f"根据Token获取用户失败: {e}", exc_info=True)
        return None


def get_current_user(
    session: Session = Depends(get_db_session),
    authorization: Optional[str] = Header(None, description="Authorization Header，格式: Bearer {token}"),
    token: Optional[str] = Query(None, description="Token（可选，如果未提供Authorization Header）")
) -> UserModel:
    """获取当前登录用户（依赖注入函数）
    
    支持两种方式获取token：
    1. 从 Authorization Header 获取：Authorization: Bearer {token}
    2. 从 Query 参数获取：?token={token}
    
    如果未登录或token无效，抛出HTTPException，统一返回 returncode=401, message='未登录'
    
    Args:
        session: 数据库会话（自动注入）
        authorization: Authorization Header
        token: Query 参数中的 token
        
    Returns:
        当前登录的用户模型
        
    Raises:
        HTTPException: 如果token无效、过期或用户不存在，统一返回 returncode=401, message='未登录'
    """
    # 优先从 Authorization Header 获取 token
    user_token = None
    
    if authorization:
        # 支持 Bearer token 格式
        if authorization.startswith("Bearer "):
            user_token = authorization[7:].strip()
        else:
            # 也支持直接传递 token
            user_token = authorization.strip()
    
    # 如果 Header 中没有，尝试从 Query 参数获取
    if not user_token and token:
        user_token = token
    
    # 如果都没有，抛出统一格式的异常
    if not user_token:
        logger.warning("未提供Token")
        raise HTTPException(
            status_code=401,
            detail="未登录"
        )
    
    # 获取用户信息
    user = get_user_by_token(session, user_token)
    
    if not user:
        logger.warning(f"Token无效或已过期: token={user_token[:20]}...")
        raise HTTPException(
            status_code=401,
            detail="未登录"
        )
    
    return user


def get_current_user_optional(
    session: Session = Depends(get_db_session),
    authorization: Optional[str] = Header(None, description="Authorization Header，格式: Bearer {token}"),
    token: Optional[str] = Query(None, description="Token（可选，如果未提供Authorization Header）")
) -> Optional[UserModel]:
    """获取当前登录用户（可选，依赖注入函数）
    
    与 get_current_user 类似，但如果未提供token或token无效，返回None而不是抛出异常
    适用于某些接口需要用户信息但登录是可选的场景
    
    Args:
        session: 数据库会话（自动注入）
        authorization: Authorization Header
        token: Query 参数中的 token
        
    Returns:
        当前登录的用户模型，如果未登录则返回None
    """
    try:
        return get_current_user(session, authorization, token)
    except HTTPException:
        # 如果token无效，返回None而不是抛出异常
        return None


def build_user_dict(user: UserModel, include_token_expiry: bool = False) -> dict:
    """构建用户信息字典（不包含敏感信息）
    
    Args:
        user: 用户模型
        include_token_expiry: 是否包含token过期时间
        
    Returns:
        用户信息字典
    """
    user_dict = {
        "id": user.id,
        "username": user.username,
        "portrait": user.portrait,
        "mobile": user.mobile,
        "email": user.email,
        "group": user.group,
        "permissions": user.permissions,
        "account_status": user.account_status,
        "created_time": format_datetime(user.created_time),
        "updated_time": format_datetime(user.updated_time)
    }
    if include_token_expiry:
        user_dict["token_expiry"] = format_datetime(user.token_expiry)
    return user_dict


def call_external_api(method: str, url: str, params: Optional[Dict] = None, json_data: Optional[Dict] = None, timeout: int = 10) -> Dict[str, Any]:
    """调用外部API的通用函数
    
    Args:
        method: HTTP方法（GET/POST）
        url: 请求URL
        params: URL参数（用于GET请求）
        json_data: JSON数据（用于POST请求）
        timeout: 请求超时时间（秒）
        
    Returns:
        API响应的JSON数据
        
    Raises:
        HTTPException: 当请求失败时
    """
    try:
        if method.upper() == "GET":
            response = requests.get(url, params=params, timeout=timeout)
        elif method.upper() == "POST":
            response = requests.post(url, json=json_data, params=params, timeout=timeout)
        else:
            raise ValueError(f"不支持的HTTP方法: {method}")
        
        response.raise_for_status()
        result = response.json()
        
        # 检查返回的code和status字段
        if result.get("code") != 200 or result.get("status") != 1:
            error_msg = result.get("info") or result.get("message") or "API返回错误"
            logger.warning(f"API返回错误: url={url}, code={result.get('code')}, status={result.get('status')}, error={error_msg}")
            raise HTTPException(
                status_code=400,
                detail=f"API返回错误: {error_msg}"
            )
        
        return result
        
    except requests.exceptions.Timeout:
        logger.error(f"请求超时: url={url}")
        raise HTTPException(
            status_code=504,
            detail="请求超时，请稍后重试"
        )
    except requests.exceptions.RequestException as e:
        logger.error(f"网络请求失败: url={url}, error={e}")
        raise HTTPException(
            status_code=503,
            detail=f"网络请求失败: {str(e)}"
        )
    except Exception as e:
        logger.error(f"调用外部API失败: url={url}, error={e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"调用外部API失败: {str(e)}"
        )


# ============= 用户路由器 =============
def create_user_router() -> APIRouter:
    """创建用户管理相关的路由器
    
    Returns:
        配置好的 APIRouter
    """
    router = APIRouter(tags=["用户管理"], prefix="/api/user")

    @router.get("/qr/generate", response_model=dict, summary="生成二维码")
    async def generate_qr():
        """生成二维码用于快捷登录
        
        调用外部接口生成二维码，返回 uuid 和二维码图片的base64编码（qr_base_code）
        
        Returns:
            包含 uuid 和 qr_base_code（base64编码的二维码图片）的响应
        """
        try:
            logger.info("收到生成二维码请求")
            
            # 调用外部接口生成二维码
            url = f"{BASE_URL}/generate"
            result = call_external_api("POST", url)
            
            # 提取返回数据
            return_object = result.get("returnObject", {})
            uuid_value = return_object.get("uuid")
            status = return_object.get("status")
            
            if not uuid_value:
                logger.error(f"二维码生成失败: 未返回uuid, result={result}")
                return create_error_response(
                    ApiErrorCode.QR_GENERATE_FAILED,
                    "二维码生成失败: 未返回uuid"
                )
            
            # 拼接二维码完整URL
            qr_url = f"https://app.corpautohome.com/newautobots/qr/confirm?uuid={uuid_value}"
            
            # 生成二维码图片的base64编码
            try:
                qr_base64 = generate_qrcode(qr_url, return_base64=True, image_format='PNG')
                if not qr_base64:
                    logger.error(f"二维码图片生成失败: uuid={uuid_value}")
                    return create_error_response(
                        ApiErrorCode.QR_GENERATE_FAILED,
                        "二维码图片生成失败"
                    )
                logger.debug(f"二维码图片生成成功: uuid={uuid_value}, base64长度={len(qr_base64)}")
            except Exception as qr_error:
                logger.error(f"生成二维码图片失败: uuid={uuid_value}, error={qr_error}", exc_info=True)
                return create_error_response(
                    ApiErrorCode.QR_GENERATE_FAILED,
                    f"生成二维码图片失败: {str(qr_error)}"
                )
            
            logger.info(f"二维码生成成功: uuid={uuid_value}")
            
            return create_success_response({
                "uuid": uuid_value,
                "qr_base_code": qr_base64,
                "status": status
            }, message="二维码生成成功")
            
        except requests.exceptions.Timeout:
            logger.error("生成二维码请求超时")
            return create_error_response(ApiErrorCode.NETWORK_ERROR, "请求超时，请稍后重试")
        except requests.exceptions.RequestException as req_error:
            logger.error(f"生成二维码网络请求失败: {req_error}", exc_info=True)
            return create_error_response(ApiErrorCode.NETWORK_ERROR, f"网络请求失败: {str(req_error)}")
        except HTTPException:
            # 重新抛出HTTP异常
            raise
        except Exception as e:
            logger.error(f"生成二维码失败: {e}", exc_info=True)
            return create_error_response(
                ApiErrorCode.QR_GENERATE_FAILED,
                f"生成二维码失败: {str(e)}"
            )

    @router.get("/qr/check", response_model=dict, summary="检查二维码状态")
    async def check_qr_status(
        uuid: str = Query(..., description="二维码UUID"),
        session: Session = Depends(get_db_session)
    ):
        """检查二维码状态（供前端轮询调用）
        
        检查二维码的扫码状态，当状态为30（成功）且返回token时，自动调用验证接口获取用户信息
        
        Args:
            uuid: 二维码UUID
            session: 数据库会话（自动注入）
            
        Returns:
            包含状态、token和用户信息的响应
        """
        try:
            logger.info(f"收到检查二维码状态请求: uuid={uuid}")
            
            if not uuid:
                return create_error_response(
                    ApiErrorCode.INVALID_PARAMETER,
                    "uuid参数不能为空"
                )
            
            # 调用外部接口检查状态
            url = f"{BASE_URL}/check"
            params = {"uuid": uuid}
            result = call_external_api("GET", url, params=params)
            
            # 提取返回数据
            return_object = result.get("returnObject", {})
            status = return_object.get("status")
            token = return_object.get("token")
            
            if status is None:
                logger.error(f"检查二维码状态失败: 未返回status, result={result}")
                return create_error_response(
                    ApiErrorCode.QR_CHECK_FAILED,
                    "检查二维码状态失败: 未返回status"
                )
            
            # 根据状态码处理
            response_data = {
                "status": status,
                "token": token
            }
            
            # 当 status=SUCCESS(30) 且 token 有值时，自动调用验证接口
            if status == QRStatus.SUCCESS and token:
                logger.info(f"二维码扫码成功，开始验证token: uuid={uuid}")
                try:
                    # 调用验证接口
                    validate_url = f"{BASE_URL}/validateTokenIoa"
                    validate_params = {"token": token}
                    validate_result = call_external_api("POST", validate_url, params=validate_params)
                    
                    # 提取用户信息
                    raw_user_info = validate_result.get("returnObject", {})
                    
                    # 解析用户信息：将 photoUrl 映射为 portrait，adAccount 映射为 username
                    user_info = {}
                    if "photoUrl" in raw_user_info:
                        user_info["portrait"] = raw_user_info["photoUrl"]
                    if "adAccount" in raw_user_info:
                        user_info["username"] = raw_user_info["adAccount"]
                    
                    # 保留其他字段（如果有）
                    for key, value in raw_user_info.items():
                        if key not in ["photoUrl", "adAccount"]:
                            user_info[key] = value
                    
                    # 生成系统token并保存/更新用户信息到数据库
                    if user_info.get("username"):
                        try:
                            # 生成系统token
                            system_token = generate_token()
                            logger.debug(f"为用户生成系统token: username={user_info.get('username')}, token_length={len(system_token)}")
                            
                            # 使用依赖注入的数据库会话
                            saved_user = save_or_update_user(session, user_info, system_token)
                            
                            # 将系统token添加到响应中
                            response_data["user_token"] = system_token
                            response_data["user_info"] = user_info
                            
                            logger.info(f"用户登录成功: username={saved_user.username}, token已生成并保存")
                        except Exception as db_error:
                            logger.error(f"保存用户信息失败: uuid={uuid}, error={db_error}", exc_info=True)
                            # 数据库操作失败不影响返回用户信息，但token不会保存
                            response_data["user_info"] = user_info
                            response_data["db_error"] = str(db_error)
                    else:
                        # 没有username，只返回用户信息
                        response_data["user_info"] = user_info
                        logger.warning(f"用户信息缺少username: uuid={uuid}, user_info={user_info}")
                    
                    logger.info(f"Token验证成功: uuid={uuid}, user_info={user_info}")
                except Exception as validate_error:
                    logger.error(f"Token验证失败: uuid={uuid}, error={validate_error}", exc_info=True)
                    # Token验证失败不影响状态检查结果，只记录错误
                    response_data["validate_error"] = str(validate_error)
            elif status == QRStatus.EXPIRED:
                logger.info(f"二维码已过期: uuid={uuid}")
            elif status == QRStatus.PENDING:
                logger.debug(f"二维码待扫码: uuid={uuid}")
            elif status == QRStatus.SCANNED:
                logger.info(f"二维码已扫码: uuid={uuid}")
            
            return create_success_response(response_data, message="状态检查成功")
            
        except requests.exceptions.Timeout:
            logger.error(f"检查二维码状态请求超时: uuid={uuid}")
            return create_error_response(ApiErrorCode.NETWORK_ERROR, "请求超时，请稍后重试")
        except requests.exceptions.RequestException as req_error:
            logger.error(f"检查二维码状态网络请求失败: uuid={uuid}, error={req_error}", exc_info=True)
            return create_error_response(ApiErrorCode.NETWORK_ERROR, f"网络请求失败: {str(req_error)}")
        except ValueError as val_error:
            logger.error(f"检查二维码状态参数错误: uuid={uuid}, error={val_error}", exc_info=True)
            return create_error_response(ApiErrorCode.INVALID_PARAMETER, f"参数错误: {str(val_error)}")
        except HTTPException:
            # 重新抛出HTTP异常
            raise
        except Exception as e:
            logger.error(f"检查二维码状态失败: uuid={uuid}, error={e}", exc_info=True)
            return create_error_response(
                ApiErrorCode.QR_CHECK_FAILED,
                f"检查二维码状态失败: {str(e)}"
            )

    @router.get("/token/verify", response_model=dict, summary="校验Token有效性")
    async def verify_token_endpoint(
        token: str = Query(..., description="要校验的Token"),
        current_user: UserModel = Depends(get_current_user),
        session: Session = Depends(get_db_session)
    ):
        """校验Token是否有效
        
        需要登录才能访问
        
        Args:
            token: 要校验的Token
            current_user: 当前登录用户（自动注入）
            
        Returns:
            Token有效性结果
        """
        try:
            is_valid = verify_token(session, token)
            
            if is_valid:
                return create_success_response({
                    "valid": True,
                    "message": "Token有效"
                }, message="Token校验成功")
            else:
                return create_error_response(
                    ApiErrorCode.TOKEN_VALIDATE_FAILED,
                    "Token无效或已过期"
                )
        except Exception as e:
            logger.error(f"校验Token失败: {e}", exc_info=True)
            return create_error_response(
                ApiErrorCode.TOKEN_VALIDATE_FAILED,
                f"校验Token失败: {str(e)}"
            )

    @router.get("/token/user", response_model=dict, summary="根据Token获取用户信息")
    async def get_user_by_token_endpoint(
        token: str = Query(..., description="用户Token"),
        current_user: UserModel = Depends(get_current_user),
        session: Session = Depends(get_db_session)
    ):
        """根据Token获取用户信息
        
        需要登录才能访问
        
        Args:
            token: 用户Token
            current_user: 当前登录用户（自动注入）
            
        Returns:
            用户信息
        """
        try:
            # 使用传入的token查询用户（如果提供了token参数）
            # 否则使用当前登录用户
            user = None
            if token:
                user = get_user_by_token(session, token)
            
            # 如果没有提供token或token无效，使用当前登录用户
            if not user:
                user = current_user
            
            # 使用通用函数构建用户信息响应
            user_data = build_user_dict(user)
            
            return create_success_response(user_data, message="获取用户信息成功")
            
        except Exception as e:
            logger.error(f"获取用户信息失败: {e}", exc_info=True)
            return create_error_response(
                ApiErrorCode.TOKEN_VALIDATE_FAILED,
                f"获取用户信息失败: {str(e)}"
            )

    @router.get("/list", response_model=dict, summary="获取用户列表")
    async def get_user_list(
        page: int = Query(1, ge=1, description="页码"),
        page_size: int = Query(20, ge=1, le=100, description="每页数量"),
        username: Optional[str] = Query(None, description="按用户名筛选（支持模糊匹配）"),
        group: Optional[str] = Query(None, description="按用户组筛选"),
        account_status: Optional[str] = Query(None, description="按账户状态筛选"),
        keyword: Optional[str] = Query(None, description="关键词搜索（username、mobile、email）"),
        current_user: UserModel = Depends(get_current_user),
        session: Session = Depends(get_db_session)
    ):
        """获取用户列表（支持分页和筛选）
        
        权限要求：只有用户名为 'jingjiejie' 的用户才能访问
        
        Args:
            page: 页码（从1开始）
            page_size: 每页数量
            username: 用户名筛选（支持模糊匹配）
            group: 用户组筛选
            account_status: 账户状态筛选
            keyword: 关键词搜索
            current_user: 当前登录用户（自动注入）
            
        Returns:
            用户列表
        """
        try:
            # 权限检查：只有 'jingjiejie' 用户可以访问
            if not check_admin_permission(current_user):
                logger.warning(f"用户 {current_user.username} 尝试访问用户列表，权限不足")
                return create_error_response(
                    ApiErrorCode.PERMISSION_DENIED,
                    "权限不足，只有管理员可以查看用户列表"
                )
            
            logger.debug(f"收到获取用户列表请求: page={page}, page_size={page_size}, username={username}, group={group}, account_status={account_status}, 操作人={current_user.username}")
            
            # 构建查询条件
            conditions = [UserModel.is_del == 0]
            
            if username:
                conditions.append(UserModel.username.contains(username))
            
            if group:
                conditions.append(UserModel.group == group)
            
            if account_status:
                conditions.append(UserModel.account_status == account_status)
            
            if keyword:
                # 关键词搜索：username、mobile、email
                keyword_conditions = [UserModel.username.contains(keyword)]
                # 对于可能为None的字段，需要特殊处理
                keyword_conditions.append(UserModel.mobile.contains(keyword))
                keyword_conditions.append(UserModel.email.contains(keyword))
                conditions.append(or_(*keyword_conditions))
            
            # 查询总数
            count_statement = select(UserModel).where(and_(*conditions))
            total = len(session.exec(count_statement).all())
            
            # 分页查询
            statement = (
                select(UserModel)
                .where(and_(*conditions))
                .order_by(UserModel.id.desc())
                .offset((page - 1) * page_size)
                .limit(page_size)
            )
            users_list = session.exec(statement).all()
            
            # 使用通用函数构建返回数据
            users_data = [build_user_dict(user, include_token_expiry=True) for user in users_list]
            
            logger.info(f"成功返回用户列表: total={total}, 返回={len(users_list)}")
            return create_success_response({
                "total": total,
                "page": page,
                "page_size": page_size,
                "users": users_data
            })
            
        except Exception as e:
            logger.error(f"获取用户列表失败: {e}", exc_info=True)
            return create_error_response(
                ApiErrorCode.INVALID_PARAMETER,
                f"获取用户列表失败: {str(e)}"
            )

    @router.post("/batch-update", response_model=dict, summary="批量更新用户信息")
    async def batch_update_users(
        request: UserBatchUpdateRequest = Body(...),
        current_user: UserModel = Depends(get_current_user),
        session: Session = Depends(get_db_session)
    ):
        """批量更新用户信息
        
        权限要求：只有用户名为 'jingjiejie' 的用户才能操作
        
        可以更新以下字段：
        - mobile: 手机号
        - email: 邮箱
        - group: 用户组
        - permissions: 权限信息
        - account_status: 账户状态
        
        Args:
            request: 批量更新请求
            current_user: 当前登录用户（自动注入）
            
        Returns:
            更新结果
        """
        try:
            # 权限检查：只有 'jingjiejie' 用户可以操作
            if not check_admin_permission(current_user):
                logger.warning(f"用户 {current_user.username} 尝试批量更新用户信息，权限不足")
                return create_error_response(
                    ApiErrorCode.PERMISSION_DENIED,
                    "权限不足，只有管理员可以批量更新用户信息"
                )
            
            logger.info(f"收到批量更新用户请求: user_ids={request.user_ids}, 更新字段={[k for k, v in request.dict(exclude={'user_ids'}).items() if v is not None]}, 操作人={current_user.username}")
            
            if not request.user_ids:
                return create_error_response(
                    ApiErrorCode.INVALID_PARAMETER,
                    "user_ids不能为空"
                )
            
            # 检查是否有要更新的字段
            update_fields = {}
            if request.mobile is not None:
                update_fields['mobile'] = request.mobile
            if request.email is not None:
                update_fields['email'] = request.email
            if request.group is not None:
                update_fields['group'] = request.group
            if request.permissions is not None:
                update_fields['permissions'] = request.permissions
            if request.account_status is not None:
                update_fields['account_status'] = request.account_status
            
            if not update_fields:
                return create_error_response(
                    ApiErrorCode.INVALID_PARAMETER,
                    "没有提供要更新的字段"
                )
            
            # 查询要更新的用户
            statement = select(UserModel).where(
                and_(
                    UserModel.id.in_(request.user_ids),
                    UserModel.is_del == 0
                )
            )
            users = session.exec(statement).all()
            
            if not users:
                return create_error_response(
                    ApiErrorCode.USER_NOT_FOUND,
                    "未找到要更新的用户"
                )
            
            # 记录找到的用户ID和未找到的用户ID
            found_user_ids = [user.id for user in users]
            not_found_user_ids = [uid for uid in request.user_ids if uid not in found_user_ids]
            
            # 批量更新用户信息
            updated_count = 0
            for user in users:
                logger.debug(f"正在更新用户 {user.id} ({user.username}): {update_fields}")
                
                # 更新字段
                for field, value in update_fields.items():
                    setattr(user, field, value)
                
                # 更新时间戳
                user.updated_time = datetime.now()
                
                session.add(user)
                updated_count += 1
            
            # 提交更新
            session.commit()
            
            logger.info(f"批量更新用户成功: 更新了{updated_count}个用户, 未找到{len(not_found_user_ids)}个用户")
            
            result = {
                "updated_count": updated_count,
                "found_user_ids": found_user_ids,
                "not_found_user_ids": not_found_user_ids,
                "updated_fields": list(update_fields.keys())
            }
            
            return create_success_response(result, message=f"成功更新{updated_count}个用户信息")
            
        except Exception as e:
            session.rollback()
            logger.error(f"批量更新用户失败: {e}", exc_info=True)
            return create_error_response(
                ApiErrorCode.BATCH_UPDATE_FAILED,
                f"批量更新用户失败: {str(e)}"
            )

    return router
