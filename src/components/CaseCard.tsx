import React from 'react';
import {
  Card,
  CardContent,
  CardActions,
  Typography,
  Chip,
  Box,
  Stack,
  IconButton,
  Tooltip,
  Avatar,
  AvatarGroup,
} from '@mui/material';
import {
  Edit as EditIcon,
  Visibility as ViewIcon,
  CalendarToday as CalendarIcon,
  AccountTree as GraphIcon,
  // Timeline as TimelineIcon, // Timeline and Map temporarily hidden
  // Map as MapIcon, // Timeline and Map temporarily hidden
} from '@mui/icons-material';
import type { Case } from '../types/case';
import { CaseStatus, CasePriority } from '../types/case';
import { ChangeStatus } from '../types/graph';

interface CaseCardProps {
  case: Case;
  onEdit?: (caseItem: Case) => void;
  onView?: (caseItem: Case) => void;
  onViewInGraph?: (caseItem: Case) => void;
  // Timeline and Map temporarily hidden
  // onViewInTimeline?: (caseItem: Case) => void;
  // onViewInMap?: (caseItem: Case) => void;
  showQuickActions?: boolean;
}

const CaseCard: React.FC<CaseCardProps> = ({ 
  case: caseItem, 
  onEdit, 
  onView, 
  onViewInGraph,
  // Timeline and Map temporarily hidden
  // onViewInTimeline,
  // onViewInMap,
  showQuickActions = true,
}) => {
  const getPriorityColor = (priority: CasePriority) => {
    switch (priority) {
      case CasePriority.CRITICAL:
        return 'error';
      case CasePriority.HIGH:
        return 'warning';
      case CasePriority.MEDIUM:
        return 'info';
      case CasePriority.LOW:
        return 'default';
      default:
        return 'default';
    }
  };

  const getStatusColor = (status: CaseStatus) => {
    switch (status) {
      case CaseStatus.LEADS:
        return '#78909c'; // Blue Grey
      case CaseStatus.ACTIVE_INVESTIGATION:
        return '#1976d2'; // Blue
      case CaseStatus.PROSECUTION:
        return '#f57c00'; // Orange
      case CaseStatus.CLOSED:
        return '#388e3c'; // Green
      default:
        return '#757575';
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const getAgentInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase();
  };

  return (
    <Card
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderLeft: `4px solid ${getStatusColor(caseItem.status)}`,
        transition: 'all 0.2s',
        '&:hover': {
          transform: 'translateY(-2px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1, pb: 1 }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {caseItem.caseNumber}
            </Typography>
            <Typography variant="h6" sx={{ fontSize: '1rem', fontWeight: 600, mt: 0.5, mb: 1 }}>
              {caseItem.name}
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.5}>
            <Chip
              label={caseItem.priority}
              size="small"
              color={getPriorityColor(caseItem.priority)}
              sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
            />
            {caseItem.changeStatus === ChangeStatus.NEW && (
              <Chip
                label="NEW"
                size="small"
                color="success"
                sx={{ height: 22, fontSize: '0.7rem', fontWeight: 600 }}
              />
            )}
          </Stack>
        </Box>

        {/* Description */}
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{
            mb: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: '2.5em',
          }}
        >
          {caseItem.description}
        </Typography>

        {/* Tags */}
        {caseItem.tags.length > 0 && (
          <Box sx={{ mb: 2 }}>
            <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
              {caseItem.tags.slice(0, 3).map((tag) => (
                <Chip
                  key={tag}
                  label={tag}
                  size="small"
                  variant="outlined"
                  sx={{ fontSize: '0.65rem', height: 20 }}
                />
              ))}
              {caseItem.tags.length > 3 && (
                <Chip label={`+${caseItem.tags.length - 3}`} size="small" variant="outlined" sx={{ fontSize: '0.65rem', height: 20 }} />
              )}
            </Stack>
          </Box>
        )}

        {/* Metadata */}
        <Stack spacing={1}>
          {/* Entities */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Entities:
            </Typography>
            <Chip label={caseItem.entityIds.length} size="small" sx={{ height: 18, fontSize: '0.7rem' }} />
          </Box>

          {/* Dates */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <CalendarIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            <Typography variant="caption" color="text.secondary">
              Created: {formatDate(caseItem.createdDate)}
            </Typography>
          </Box>

          {caseItem.targetDate && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
              <CalendarIcon sx={{ fontSize: 14, color: 'warning.main' }} />
              <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
                Target: {formatDate(caseItem.targetDate)}
              </Typography>
            </Box>
          )}

          {/* Agents */}
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              Team:
            </Typography>
            <AvatarGroup max={3} sx={{ '& .MuiAvatar-root': { width: 24, height: 24, fontSize: '0.7rem' } }}>
              {caseItem.assignedAgents.map((agent) => (
                <Tooltip key={agent} title={agent}>
                  <Avatar sx={{ bgcolor: 'primary.main' }}>{getAgentInitials(agent)}</Avatar>
                </Tooltip>
              ))}
            </AvatarGroup>
          </Box>

          {/* Lead Agent */}
          {caseItem.leadAgent && (
            <Typography variant="caption" color="text.secondary">
              Lead: <strong>{caseItem.leadAgent}</strong>
            </Typography>
          )}

          {/* Classification */}
          <Chip
            label={caseItem.classification}
            size="small"
            color="warning"
            variant="outlined"
            sx={{ width: 'fit-content', height: 18, fontSize: '0.65rem', fontWeight: 600 }}
          />
        </Stack>
      </CardContent>

      {/* Actions */}
      <CardActions sx={{ justifyContent: 'space-between', pt: 0, flexWrap: 'wrap', gap: 1 }}>
        {showQuickActions && (
          <Stack direction="row" spacing={0.5}>
            {onViewInGraph && (
              <Tooltip title="View in Graph">
                <IconButton size="small" color="secondary" onClick={() => onViewInGraph(caseItem)}>
                  <GraphIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {/* Timeline and Map temporarily hidden */}
            {/* {onViewInTimeline && (
              <Tooltip title="View Timeline">
                <IconButton size="small" color="secondary" onClick={() => onViewInTimeline(caseItem)}>
                  <TimelineIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )} */}
            {/* {onViewInMap && (
              <Tooltip title="View on Map">
                <IconButton size="small" color="secondary" onClick={() => onViewInMap(caseItem)}>
                  <MapIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )} */}
          </Stack>
        )}
        <Stack direction="row" spacing={0.5} sx={{ ml: showQuickActions ? 0 : 'auto' }}>
          {onEdit && (
            <Tooltip title="Edit Case">
              <IconButton size="small" color="primary" onClick={() => onEdit(caseItem)}>
                <EditIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          {onView && (
            <Tooltip title="View Details">
              <IconButton size="small" onClick={() => onView(caseItem)}>
                <ViewIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
        </Stack>
      </CardActions>
    </Card>
  );
};

export default CaseCard;


